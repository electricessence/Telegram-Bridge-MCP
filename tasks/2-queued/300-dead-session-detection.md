# Feature: Dead Session Detection (Heartbeat)

## Type

Feature / Reliability

## Priority

300

## Description

If an agent session stops calling `dequeue_update` (crash, timeout, network loss), the server has no way to know. Messages continue routing to the dead session's queue and pile up forever. The operator sees silence and doesn't know why.

Need a heartbeat mechanism: if a session hasn't polled `dequeue_update` within N seconds, mark it unhealthy. Optionally reroute its messages and notify the operator.

## Current State

- `dequeue_update` is the only polling mechanism. Each call is stateless — the server doesn't track when the last poll happened.
- `session-queue.ts` tracks per-session queues but has no health/liveness concept.
- `session-manager.ts` tracks creation time but not last-active time.

## Design Sketch

1. **Track last poll time** — in `dequeue_update` handler, update `session.lastPollAt = Date.now()` on every call.
2. **Health check interval** — periodic timer (e.g., every 60s) checks all sessions. If `Date.now() - lastPollAt > THRESHOLD`, mark unhealthy.
3. **Unhealthy behavior** — options:
   - Reroute messages to governor (safest)
   - Notify operator: "🤖 Worker appears unresponsive"
   - Auto-close after extended timeout (aggressive)
4. **Recovery** — if session resumes polling, automatically mark healthy again.

## Design Decisions

- **Threshold:** `DEQUEUE_TIMEOUT + 60s` buffer. If the default dequeue timeout is 300s, a session is unhealthy after 360s of silence.
- **Unhealthy behavior:** Reroute messages + notify operator. Do NOT auto-close — let the operator or overseer decide. The session may recover.
- **No manual kick** for now — operator can ask an agent to call `close_session`. A future `/kick` command can come later.
- **Recovery:** If a session resumes polling (`dequeue_update`), automatically mark it healthy again. No operator notification on recovery (too noisy).

## Code Path

1. `src/session-manager.ts` — Add `lastPollAt: number` to session record. Export `touchSession(sid)` to update timestamp. Add `getUnhealthySessions(thresholdMs): Session[]`.
2. `src/tools/dequeue_update.ts` — Call `touchSession(sid)` at the start of every poll.
3. `src/session-manager.ts` (or new `src/health-check.ts`) — `setInterval` that runs every 60s, calls `getUnhealthySessions()`, reroutes messages, notifies operator.
4. `src/session-queue.ts` — Add `reroute(fromSid, toSid)` to move pending messages.
5. `src/telegram.ts` — Send unhealthy notification: `⚠️ {name} appears unresponsive.`

## Acceptance Criteria

- [ ] `dequeue_update` records last poll timestamp per session
- [ ] Health check detects sessions that haven't polled within threshold
- [ ] Unhealthy sessions trigger operator notification
- [ ] Messages rerouted away from unhealthy sessions
- [ ] Recovery: session resumes healthy status on next poll
- [ ] Tests for health detection, notification, and recovery
- [ ] All tests pass: `pnpm test`
