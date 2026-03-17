# Feature: Session Close Teardown Contract

## Type

Feature / Architecture

## Priority

200

## Description

When a session closes (agent finishes, crashes, or is kicked), the server needs a defined cleanup contract. Currently `close_session` removes the session from the session manager and resets governor routing, but several questions are unanswered:

- What happens to messages already queued for the closed session?
- Does the operator get notified?
- Does the closing session's outbound proxy state get cleaned up?
- What about pending `choose`/`confirm`/`ask` interactions owned by that session?

## Current State

`close_session.ts` calls:

1. `closeSession(sid)` — removes from session manager
2. `removeSessionQueue(sid)` — removes per-session queue
3. Governor promotion if applicable (task 200, completed)
4. Returns `{ closed: true }`

Messages in the removed queue are silently dropped. No operator notification. No cleanup of pending interactions.

## Design Decisions

1. **Orphaned messages:** Reroute to the governor (or next lowest SID if no governor). If no sessions remain, leave in a dead-letter queue for the next session that joins.
2. **Operator notification:** Always. Send `🤖 {name} has disconnected.` to the chat. Not configurable — always good to know.
3. **Pending interactions:** Callbacks for `choose`/`confirm`/`ask` owned by the closed session become no-ops. If the operator presses a button, answer the callback query with "Session closed" and dismiss. Don't error.
4. **Outbound proxy cleanup:** No explicit cleanup needed — proxy state is keyed by SID which is gone. The name-tag header builder (`buildHeader`) calls `getSession(sid)` which returns `undefined` for closed sessions, so the header naturally falls away.

## Code Path

1. `src/tools/close_session.ts` — After closing, call a new `teardownSession(sid)` in session-manager.
2. `src/session-manager.ts` — Add `teardownSession(sid)`: drain orphaned queue → reroute messages → send disconnect notification → clean up pending callbacks.
3. `src/session-queue.ts` — Add `drainQueue(sid): Update[]` — returns all pending messages before removing the queue.
4. `src/telegram.ts` — Send the disconnect notification message.
5. Callback handlers (confirm/choose/ask) — Check if owning session still exists; if not, answer callback with "Session closed".

## Acceptance Criteria

- [ ] Defined behavior for orphaned messages when a session closes
- [ ] Operator notification on session close (configurable severity)
- [ ] Pending interaction cleanup (callbacks, asks)
- [ ] Outbound proxy state cleanup
- [ ] All edge cases documented and tested
- [ ] All tests pass: `pnpm test`
