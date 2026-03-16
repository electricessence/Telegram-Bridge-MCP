/**
 * Direct message permissions between sessions.
 *
 * Permissions are **directional**: A→B does not imply B→A.
 * Each direction requires explicit operator approval via `confirm`.
 * Permissions are ephemeral (in-memory only, reset on restart).
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** "sender:target" → true. Only present when granted. */
const _grants = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function key(sender: number, target: number): string {
  return `${sender}:${target}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Grant directional DM permission: sender → target. */
export function grantDm(sender: number, target: number): void {
  _grants.add(key(sender, target));
}

/** Revoke directional DM permission: sender → target. */
export function revokeDm(sender: number, target: number): boolean {
  return _grants.delete(key(sender, target));
}

/** Check if sender has DM permission to target. */
export function hasDmPermission(
  sender: number,
  target: number,
): boolean {
  return _grants.has(key(sender, target));
}

/** Remove all permissions involving a session (both directions). */
export function revokeAllForSession(sid: number): void {
  for (const k of _grants) {
    const [s, t] = k.split(":").map(Number);
    if (s === sid || t === sid) _grants.delete(k);
  }
}

/** List all sessions that `sender` can DM. */
export function dmTargetsFor(sender: number): number[] {
  const targets: number[] = [];
  for (const k of _grants) {
    const [s, t] = k.split(":").map(Number);
    if (s === sender) targets.push(t);
  }
  return targets.sort((a, b) => a - b);
}

/** List all sessions that can DM `target`. */
export function dmSendersFor(target: number): number[] {
  const senders: number[] = [];
  for (const k of _grants) {
    const [s, t] = k.split(":").map(Number);
    if (t === target) senders.push(s);
  }
  return senders.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Reset (testing only)
// ---------------------------------------------------------------------------

export function resetDmPermissionsForTest(): void {
  _grants.clear();
}
