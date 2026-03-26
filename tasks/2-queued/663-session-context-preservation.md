# 663 — Session Context Preservation Audit + Fix

| Field    | Value        |
| -------- | ------------ |
| Created  | 2026-03-26   |
| Priority | high         |
| Scope    | Telegram MCP |

## Problem

In multi-session mode, message edits triggered by callbacks (button presses) can inject the wrong session's header/nametag because the edit runs outside the original session's `AsyncLocalStorage` context. The outbound proxy always re-injects headers on edit via `buildHeader()`, which calls `getCallerSid()`, which falls back to `getActiveSession()` — a global mutable value that could point to any session.

### Root Cause

`getCallerSid()` in `src/session-context.ts` falls back to `getActiveSession()` (the global `_activeSessionId`) when no `AsyncLocalStorage` context is set. Code paths that edit messages from the poller context (button callback handlers) don't have ALS context, so they inherit whatever session happens to be "active" globally.

### Confirmed Affected

**`requestOperatorApproval()`** in `src/built-in-commands.ts` (lines 68–117):
- Sends the approval prompt within the calling session's context (header correct)
- When operator clicks Approve/Deny, `handleApprovalCallback()` fires from the poller (no ALS context)
- The Promise callback edits the message via `getApi().editMessageText()` (lines 98, 109)
- Proxy recalculates header with wrong SID → message author appears to change

### Confirmed Safe

- **`confirm.ts`, `choose.ts`, `send_choice.ts`**: Use `registerCallbackHook(messageId, fn, ownerSid)` in `message-store.ts`, which runs hooks via `runInSessionContext(ownerSid, ...)` — header preserved correctly.
- **`health-check.ts`**: Fixed in v4.6.4 — captures `ownerSid` and passes to `registerCallbackHook`.
- **Animation state**: Uses `getRawApi()` — bypasses proxy entirely.
- **Tool handlers** (append_text, update_progress, etc.): Run within server middleware that wraps in `runInSessionContext(sid, ...)`.

### Needs Audit

**Panel commands** in `built-in-commands.ts` — the `/voice`, `/session`, and `/autodump` panel handlers use `getApi()` for sends and edits. These are system-level UI, not session messages. In multi-session mode, the proxy could inject a random session's header onto panel messages. These should either:
- Use `getRawApi()` (but that bypasses recording too, may be undesirable)
- Or pass a flag to suppress header injection (e.g., `_noHeader: true`)
- Or wrap in `runInSessionContext(0, ...)` to explicitly set SID to 0 (which makes `name` empty, suppressing the header)

## Fix for `requestOperatorApproval()`

Capture the caller SID on entry and wrap all edits:

```typescript
import { getCallerSid, runInSessionContext } from "./session-context.js";

export async function requestOperatorApproval(
  prompt: string,
  timeoutMs = 60_000,
): Promise<"approved" | "denied" | "timed_out" | "send_failed"> {
  const callerSid = getCallerSid(); // Capture before any async
  // ... existing send logic ...

  return new Promise<"approved" | "denied" | "timed_out">((resolve) => {
    const timer = setTimeout(() => {
      _pendingApprovals.delete(msg.message_id);
      _activePanels.delete(msg.message_id);
      void runInSessionContext(callerSid, () =>
        api.editMessageText(chatId, msg.message_id, `${prompt}\n\n_⏱ Timed out_`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] },
        })
      ).catch(() => {});
      resolve("timed_out");
    }, timeoutMs);

    _pendingApprovals.set(msg.message_id, (approved) => {
      clearTimeout(timer);
      _activePanels.delete(msg.message_id);
      const suffix = approved ? "\n\n▸ ✅ *Approved*" : "\n\n▸ ❌ *Denied*";
      void runInSessionContext(callerSid, () =>
        api.editMessageText(chatId, msg.message_id, `${prompt}${suffix}`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [] },
        })
      ).catch(() => {});
      resolve(approved ? "approved" : "denied");
    });
  });
}
```

## Fix for Panel Commands

Wrap all panel sends/edits in `runInSessionContext(0, ...)` to explicitly zero out the SID. This makes `getCallerSid()` return 0, `buildHeader()` produces empty name → no header injected. This is the correct behavior since panels are system-level, not session messages.

Affected functions (search for `getApi()` in `built-in-commands.ts`):
- `showVoicePanel()` and its callback handlers (~line 433+)
- `showSessionPanel()` and its callback handlers (~line 613+)
- `showAutoDumpPanel()` and its callback handlers (~line 959+)
- `showStatusPanel()` (~line 578+)
- Any other function that sends/edits without being called from a tool handler

Use `runInSessionContext(0, () => api.editMessageText(...))` for each.

## Tests

Add tests to `src/built-in-commands.test.ts`:
- **"requestOperatorApproval edits preserve original session context"**: Mock `getCallerSid` returning a specific SID, trigger approval callback, verify `runInSessionContext` is called with the captured SID.
- **"panel edits use SID 0"**: Verify panel commands wrap edits in `runInSessionContext(0, ...)`.

If `built-in-commands.test.ts` doesn't exist, create it with at least the `requestOperatorApproval` test.

## Changelog

Add to `changelog/unreleased.md`:

```markdown
## Fixed

- `requestOperatorApproval` edits now preserve the original session's header context (fixes message author changing after button press)
- Panel command edits (voice/session/autodump) no longer inject session headers in multi-session mode
```

## Acceptance Criteria

- [ ] `requestOperatorApproval()` captures caller SID and wraps all edits in `runInSessionContext(callerSid, ...)`
- [ ] Panel command sends/edits wrapped in `runInSessionContext(0, ...)`
- [ ] Tests verify context preservation
- [ ] All existing tests pass
- [ ] `pnpm build` clean
