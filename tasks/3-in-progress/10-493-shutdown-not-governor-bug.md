---
id: 10-493
title: "shutdown action returns NOT_GOVERNOR for the actual governor"
priority: 10
type: bug
status: queued
created: 2026-04-12
---

# 10-493 — Shutdown Returns NOT_GOVERNOR for Actual Governor

## Problem

Governor session (SID 1) called `action(type: 'shutdown')` and received:

```json
{
  "code": "NOT_GOVERNOR",
  "message": "This action requires governor privileges. Only the governor session can call this path.",
  "hint": "Only the governor session can call this action. Use action(token: <governor_token>, ...)."
}
```

This happened after closing all other sessions. SID 1 was the only remaining session and was confirmed governor by `session/list`. The preceding `session/close` on Deputy (SID 2) returned `GOVERNOR_CHANGED` then `PERMISSION_DENIED`, suggesting the governor role may have been reassigned or cleared during the Deputy close sequence.

## Likely Cause

When the Deputy session closed, governor reassignment logic may have set governor to SID 0 or cleared it, even though SID 1 (the actual governor) was still active. Then `shutdown` checked governor SID and found a mismatch.

## Reproduction

1. Start 2 sessions (SID 1 governor, SID 2 non-governor)
2. Governor calls `session/close` targeting SID 2
3. If `GOVERNOR_CHANGED` fires, retry
4. Governor calls `action(type: 'shutdown')`
5. Observe NOT_GOVERNOR error

## Files

- `src/routing-mode.ts` or wherever governor SID is tracked
- `src/session-manager.ts` — session close logic, governor reassignment
- `src/tools/action.ts` — shutdown handler's governor check

## Acceptance Criteria

- [ ] Governor closing a non-governor session does not disrupt governor role
- [ ] `shutdown` succeeds when called by the actual governor after closing other sessions
- [ ] Test: close subordinate session → shutdown → succeeds
