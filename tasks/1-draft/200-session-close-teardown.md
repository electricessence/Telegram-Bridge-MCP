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

## Questions to Answer

1. **Orphaned messages:** Should queued-but-undelivered messages be rerouted to the governor? Broadcast to all? Dropped with a log?
2. **Operator notification:** Should the operator see "🤖 Worker has disconnected" in the chat?
3. **Pending interactions:** If session 2 sent a `choose` and the operator hasn't responded, what happens to that callback? The `answer_callback_query` handler won't find the session.
4. **Outbound proxy cleanup:** `outbound-proxy.ts` may hold session-scoped state (topic, name tag). Does it need explicit cleanup?

## Acceptance Criteria

- [ ] Defined behavior for orphaned messages when a session closes
- [ ] Operator notification on session close (configurable severity)
- [ ] Pending interaction cleanup (callbacks, asks)
- [ ] Outbound proxy state cleanup
- [ ] All edge cases documented and tested
- [ ] All tests pass: `pnpm test`
