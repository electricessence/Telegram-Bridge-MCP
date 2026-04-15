/**
 * session/restore — Token-based fast reconnect after a planned bounce.
 *
 * The agent holds the same token (sid * 1_000_000 + pin) that was valid before
 * the bounce. Instead of going through the operator approval dialog, it presents
 * the token directly and the server validates it against the restored snapshot.
 *
 * No operator dialog is shown. The session is immediately marked live.
 */

import { toResult, toError } from "../telegram.js";
import {
  getRestoredSessionBySid,
  markSessionRestored,
  isRestoredSession,
  activeSessionCount,
  listSessions,
} from "../session-manager.js";
import { deliverServiceMessage, getSessionQueue, createSessionQueue } from "../session-queue.js";
import { getGovernorSid } from "../routing-mode.js";

/**
 * Handle a session/restore request.
 *
 * Input: `{ token: number }` where token = sid * 1_000_000 + pin.
 *
 * Returns: `{ token, sid, pin, sessions_active, action, pending }` on success.
 */
export function handleSessionRestore({ token }: { token: number }) {
  if (typeof token !== "number" || !Number.isFinite(token) || token <= 0) {
    return toError({
      code: "AUTH_FAILED",
      message: "Invalid token. Pass the numeric token returned by your previous session/start.",
    });
  }

  const sid = Math.floor(token / 1_000_000);
  const pin = token % 1_000_000;

  const restoredSession = getRestoredSessionBySid(sid);
  if (!restoredSession) {
    return toError({
      code: "SESSION_NOT_FOUND",
      message:
        `No restored session found for SID ${sid}. ` +
        `Either the server was not bounced with session/bounce, the snapshot has expired, ` +
        `or this SID was already restored. Call action(type: 'session/start', ...) to create a new session.`,
      hint: "If the server restarted without a planned bounce, use session/start instead.",
    });
  }

  if (restoredSession.pin !== pin) {
    return toError({
      code: "AUTH_FAILED",
      message: "Token PIN does not match the restored session. Verify your token and try again.",
    });
  }

  // Confirm the session: mark it live, reset health markers
  markSessionRestored(sid);
  restoredSession.healthy = true;
  restoredSession.lastPollAt = undefined;

  // Ensure a session queue exists (queues are not persisted across restart)
  if (!getSessionQueue(sid)) {
    createSessionQueue(sid);
  }

  // Count pending messages in the session queue
  const pending = getSessionQueue(sid)?.pendingCount() ?? 0;

  // Build orientation message
  const allSessions = listSessions();
  const governorSid = getGovernorSid();
  const confirmedSessions = allSessions.filter(s => s.sid === sid || !isRestoredSession(s.sid));

  let orientationMsg: string;
  if (confirmedSessions.length <= 1 || governorSid === 0) {
    orientationMsg =
      `Session restored. You are SID ${sid}. ` +
      `Your token is valid. Resume normal operation.`;
  } else {
    const governorSession = allSessions.find(s => s.sid === governorSid);
    const governorLabel = governorSession
      ? `'${governorSession.name}' (SID ${governorSid})`
      : `SID ${governorSid}`;
    const isGov = sid === governorSid;
    const roleNote = isGov
      ? `You are the governor (SID ${sid}). Ambiguous messages will be routed to you.`
      : `You are SID ${sid}. ${governorLabel} is your governor.`;
    orientationMsg = `Session restored. ${roleNote} Resume normal operation.`;
  }

  deliverServiceMessage(sid, orientationMsg, "session_orientation", { sid, restored: true });

  // Notify other confirmed live sessions of the reconnect
  const others = allSessions.filter(s => s.sid !== sid && !isRestoredSession(s.sid));
  for (const fellow of others) {
    deliverServiceMessage(
      fellow.sid,
      `Session '${restoredSession.name}' (SID ${sid}) has reconnected via fast restore.`,
      "session_joined",
      { sid, name: restoredSession.name, restored: true },
    );
  }

  return toResult({
    token,
    sid,
    pin,
    sessions_active: activeSessionCount(),
    action: "restored",
    pending,
  });
}
