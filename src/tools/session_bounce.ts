/**
 * session/bounce — Governor-only planned restart with session state persistence.
 *
 * Notifies other sessions of the imminent restart, then triggers
 * elegantShutdown(true) which will save session state before exiting.
 * Agents can reconnect after restart via action(type: 'session/restore', token: <token>).
 */

import { toResult, toError } from "../telegram.js";
import { requireAuth } from "../session-gate.js";
import { listSessions } from "../session-manager.js";
import { deliverDirectMessage } from "../session-queue.js";
import { elegantShutdown } from "../shutdown.js";

const BOUNCE_WARNING =
  "⚡ Server bouncing for fast restart. Your session state will be preserved. " +
  "After the server restarts, call action(type: 'session/restore', token: <your_token>) " +
  "to reconnect instantly — no operator approval required.";

/**
 * Handle a session/bounce request. Governor-only.
 *
 * @param token    - Governor session token.
 * @param reason   - Optional human-readable reason for the bounce.
 * @param wait_seconds - Optional estimated seconds before restart completes.
 */
export function handleSessionBounce({
  token,
  reason,
  wait_seconds,
}: {
  token: number;
  reason?: string;
  wait_seconds?: number;
}) {
  const _sid = requireAuth(token);
  if (typeof _sid !== "number") return toError(_sid);

  const others = listSessions().filter(s => s.sid !== _sid);

  const parts: string[] = [BOUNCE_WARNING];
  if (reason) parts.push(`Reason: ${reason}`);
  if (typeof wait_seconds === "number") {
    parts.push(`Estimated restart time: ~${wait_seconds}s`);
  }
  const text = parts.join("\n");

  let notified = 0;
  for (const s of others) {
    if (deliverDirectMessage(_sid, s.sid, text)) notified++;
  }

  // Schedule planned shutdown — fires after this tool call returns so the
  // caller receives a response before the process exits.
  setImmediate(() => { void elegantShutdown(true); });

  return toResult({
    bouncing: true,
    sessions_notified: notified,
    hint: "Call action(type: 'session/restore', token: <token>) after restart",
  });
}
