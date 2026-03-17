# Feature: Server Restart Session Recovery

## Type

Feature / Reliability

## Priority

400

## Description

All session state is in-memory. When the MCP server restarts (crash, manual restart, deploy), every session is lost. Agents reconnect and call `session_start` again, creating new sessions with new SIDs and PINs. The operator sees duplicate "joined" messages.

This is a known limitation documented in `routing-mode.ts` ("in-memory only; resets on MCP restart"). But as multi-session becomes the default, graceful recovery matters more.

## Current State

On restart:

1. All sessions are destroyed (in-memory `Map` cleared)
2. All session queues are destroyed
3. Routing mode resets to `load_balance`
4. Agents reconnect and call `session_start`
5. `session_start` detects pending messages from the old server run and offers Resume/Start Fresh
6. New SIDs are assigned from 1 — completely fresh state

## Problems

- **No session continuity** — agent loses its SID/PIN identity
- **Duplicate announcements** — operator sees "🤖 X has joined" again for every agent
- **Lost routing context** — governor, cascade, and routing mode all reset
- **Race condition** — multiple agents reconnect simultaneously, all creating sessions. Who becomes governor?

## Design Sketch

### Option A: Persisted session state

Write session state to a file on disk (`sessions.json`). On restart, reload. Agents provide their old SID/PIN and the server restores the session.

**Pro:** True continuity.
**Con:** Complexity. PIN validation across restarts. File corruption risk. Stale session cleanup.

### Option B: Graceful re-establishment (simpler)

Don't persist state. Instead:

1. On restart, `session_start` accepts an optional `previous_name` parameter.
2. If `previous_name` matches a known pattern, the agent gets a clean session but the operator sees "🤖 X has reconnected" instead of "joined".
3. First session auto-becomes governor (existing behavior from task 200).

**Pro:** Simple. No persistence. Good enough for most cases.
**Con:** SID changes. Routing state lost.

### Option C: Accept it (document the limitation)

Multi-session state is ephemeral. Restarts reset everything. Agents handle it gracefully via `session_start`'s pending message detection. Document and move on.

## Recommendation

Option B for now. Most of the "restart pain" is cosmetic (duplicate announcements). The architectural recovery (governor, routing) already works via task 200's auto-governor-on-second-join logic.

## Acceptance Criteria

- [ ] Define the official restart recovery flow
- [ ] Implement or document the chosen approach
- [ ] Test: two agents reconnect after restart — governor re-established
- [ ] Test: operator sees "reconnected" instead of "joined" (if Option B)
- [ ] All tests pass: `pnpm test`
