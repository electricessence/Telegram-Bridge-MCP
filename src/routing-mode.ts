/**
 * Routing state for multi-session ambiguous message dispatch.
 *
 * The only supported routing model is governor: one designated session
 * classifies all incoming ambiguous messages and routes them via
 * route_message. Targeted messages (reply-to / callbacks / reactions
 * traceable to a specific session) are always delivered directly to
 * that session without consulting the governor.
 *
 * Governor state is set automatically when a second session joins.
 * Stored in-memory only; resets on MCP restart.
 */

let _governorSid = 0;

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getGovernorSid(): number {
  return _governorSid;
}

export function setGovernorSid(sid: number): void {
  _governorSid = sid;
}

// ---------------------------------------------------------------------------
// Reset (testing only)
// ---------------------------------------------------------------------------

export function resetRoutingModeForTest(): void {
  _governorSid = 0;
}
