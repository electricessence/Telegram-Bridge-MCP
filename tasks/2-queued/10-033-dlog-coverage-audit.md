# Task #033 — Debug Logging Coverage Audit

| Field    | Value                           |
| -------- | ------------------------------- |
| Priority | 10 (critical observability)     |
| Created  | 2026-03-20                      |
| Type     | **Implementation** — add dlog   |

## Goal

Audit and fill gaps in `dlog()` coverage across all production source files. We were unable to debug a voice routing issue because early log entries rotated out of the buffer AND key modules (`message-store.ts`, `poller.ts`) have **zero** dlog calls. Every significant code path must be observable.

## Context

Current dlog usage (production files only):

| File | dlog calls | Categories |
|------|-----------|------------|
| `animation-state.ts` | 3 | animation |
| `dm-permissions.ts` | 1 | dm |
| `session-auth.ts` | 1 | session |
| `health-check.ts` | 3 | health |
| `session-manager.ts` | 4 | session |
| `session-queue.ts` | 8 | queue, route, dm, service |
| `tools/close_session.ts` | 3 | session |
| **`message-store.ts`** | **0** | — |
| **`poller.ts`** | **0** | — |

## Critical Gaps

### 1. `message-store.ts` — ZERO coverage

Must add dlog for:
- `recordInbound` — log every inbound message: id, type, reply_to, from. Category: `route`
- `recordOutgoing` — log every outbound: id, type, sid. Category: `route`
- `patchVoiceText` — log when voice text is patched: id, text length. Category: `route`
- Dedup skip — log when a message is skipped due to `_index.has()`. Category: `route`
- Timeline eviction — log when events are evicted from the buffer. Category: `route`

### 2. `poller.ts` — ZERO coverage

Must add dlog for:
- Voice message Phase 1 — log when voice is recorded pre-transcription: message_id, reply_to. Category: `route`
- Voice message Phase 2 — log transcription start, completion, failure. Category: `route`
- Text message — log when text message is recorded. Category: `route`
- Poll cycle — log update count per cycle. Category: `route`

### 3. Other files to check

Scan all remaining `.ts` files in `src/` and `src/tools/` for missing dlog coverage. Any function that handles messages, routes events, or manages state should have at least one dlog call at entry/exit.

## Acceptance Criteria

- [ ] Every `recordInbound` call produces a dlog entry with message id, type, and reply_to
- [ ] Every `recordOutgoing` call produces a dlog entry with message id and sid
- [ ] `patchVoiceText` logged
- [ ] Poller voice Phase 1 and Phase 2 logged
- [ ] Timeline eviction logged
- [ ] Dedup skips logged
- [ ] No changes to test files (dlog is a no-op in tests)
- [ ] Build and lint clean
- [ ] All existing tests pass
- [ ] Changelog entry added

## Files to Modify

- `src/message-store.ts` — primary target
- `src/poller.ts` — primary target
- Other files as discovered during audit
- `changelog/unreleased.md`

## Pattern

Follow the existing pattern in `session-queue.ts`:
```ts
dlog("route", `targeted event=${event.id} → sid=${targetSid}`, { type: event.content.type });
```

Keep messages concise: category, action, key identifiers, optional data object.
