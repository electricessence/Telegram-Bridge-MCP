# 662 — Auto-Pin/Unpin for Super Tools

| Field    | Value        |
| -------- | ------------ |
| Created  | 2026-03-26   |
| Priority | high         |
| Scope    | Telegram MCP |

## Goal

Add auto-pin on create and auto-unpin on completion for `send_new_progress`, `update_progress`, `send_new_checklist`, and `update_checklist`. This matches the lifecycle described in `docs/super-tools.md`.

## Reference

PR #89 (branch `copilot/add-auto-pin-progress-bar`) has a clean implementation of this feature. Use it as a guide but implement directly on `dev` — do NOT merge the PR branch (it's based on old master).

## Changes Required

### `src/tools/send_new_progress.ts`

After the `sendMessage` call succeeds (line ~82), add a best-effort pin:

```typescript
getApi().pinChatMessage(chatId, msg.message_id, { disable_notification: true }).catch(() => {});
```

Update `DESCRIPTION` to mention auto-pin:

```typescript
"Creates a new progress bar message, auto-pins it (silent), and returns its message_id. " +
```

And add to the description: `"At 100% update_progress auto-unpins the message. " +`

### `src/tools/update_progress.ts`

After the `editMessageText` call succeeds (after the `edited` variable assignment), add auto-unpin at 100%:

```typescript
if (percent === 100) {
  getApi().unpinChatMessage(chatId, message_id).catch(() => {});
}
```

Update `DESCRIPTION` to mention auto-unpin:

```typescript
"Auto-unpins the message when percent reaches 100.";
```

### `src/tools/send_new_checklist.ts`

**Create handler:** After the `sendMessage` call succeeds, add best-effort pin:

```typescript
getApi().pinChatMessage(chatId, msg.message_id, { disable_notification: true }).catch(() => {});
```

**Update handler:** After the `editMessageText` call succeeds, check if all steps are terminal:

```typescript
const TERMINAL: ReadonlySet<StepStatus> = new Set(["done", "failed", "skipped"]);
const allTerminal = steps.every(s => TERMINAL.has(s.status));
if (allTerminal) {
  getApi().unpinChatMessage(chatId, message_id).catch(() => {});
}
```

Update `CREATE_DESCRIPTION` to mention auto-pin.
Update `UPDATE_DESCRIPTION` to mention auto-unpin when all steps terminal.

### Tests

**`src/tools/send_new_progress.test.ts`:**

- Add `pinChatMessage` mock (`.mockResolvedValue(true)`)
- Test: "auto-pins the message after sending (silent)" — verify `pinChatMessage` called with `(chatId, message_id, { disable_notification: true })`

**`src/tools/update_progress.test.ts`:**

- Add `unpinChatMessage` mock
- Test: "auto-unpins when percent reaches 100"
- Test: "does not unpin when percent is less than 100"

**`src/tools/send_new_checklist.test.ts`:**

- Add `pinChatMessage` and `unpinChatMessage` mocks
- Test: "auto-pins the message after sending (silent)"
- Test: "auto-unpins when all steps reach terminal status" (mix of done/failed/skipped)
- Test: "does not unpin when steps are still in progress"
- Test: "does not unpin when any step is still pending or running"

### Docs

**`docs/super-tools.md`:**

- Remove "Planned" items about auto-pin/auto-unpin
- Document actual auto-pin/unpin behavior
- Update code examples to remove manual `pin_message` calls
- Change "Auto-unpin on complete — with a breadcrumb reply" to "Auto-unpin on complete — unpins when done so the chat stays clean"

### Changelog

Add to `changelog/unreleased.md`:

```markdown
## Added

- `send_new_checklist` auto-pins silently on creation; `update_checklist` auto-unpins when all steps terminal
- `send_new_progress` auto-pins silently on creation; `update_progress` auto-unpins at 100%
```

## Acceptance Criteria

- [ ] Pin on create for both `send_new_progress` and `send_new_checklist`
- [ ] Unpin on completion for both `update_progress` (at 100%) and `update_checklist` (all terminal)
- [ ] All pin/unpin calls are best-effort (`.catch(() => {})`)
- [ ] Tool descriptions updated to surface auto-pin/unpin behavior
- [ ] Tests cover pin, unpin, and no-unpin-when-incomplete scenarios
- [ ] `docs/super-tools.md` updated
- [ ] All existing tests still pass
- [ ] `pnpm build` clean
