/**
 * Per-session message queues and inbound routing.
 *
 * Each session gets its own TwoLaneQueue<TimelineEvent>. When an inbound
 * update arrives, the router decides which session(s) receive it:
 *
 *   - Reply-to / callback / reaction → owning session (targeted)
 *   - Ambiguous (no reply context) → all sessions (broadcast for now)
 *
 * The global queue in message-store remains the "session 0" fallback and
 * is always populated (backward compat). Session queues are additive —
 * they receive copies of the same event references.
 */

import { TwoLaneQueue } from "./two-lane-queue.js";
import type { TimelineEvent } from "./message-store.js";

// ---------------------------------------------------------------------------
// Voice-ready predicate (shared with message-store's queue)
// ---------------------------------------------------------------------------

function isEventReady(event: TimelineEvent): boolean {
  const c = event.content;
  return !(c.type === "voice" && c.text === undefined);
}

function getEventId(event: TimelineEvent): number {
  return event.id;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** sid → per-session queue */
const _queues = new Map<number, TwoLaneQueue<TimelineEvent>>();

/** message_id → owning sid (tracks which session sent each bot message) */
const _messageOwnership = new Map<number, number>();

// ---------------------------------------------------------------------------
// Queue lifecycle
// ---------------------------------------------------------------------------

/** Create a queue for a new session. Returns false if already exists. */
export function createSessionQueue(sid: number): boolean {
  if (_queues.has(sid)) return false;
  _queues.set(sid, new TwoLaneQueue<TimelineEvent>({
    isReady: isEventReady,
    getId: getEventId,
  }));
  return true;
}

/** Remove a session's queue. Returns false if not found. */
export function removeSessionQueue(sid: number): boolean {
  return _queues.delete(sid);
}

/** Get a session's queue (or undefined if no such session). */
export function getSessionQueue(sid: number): TwoLaneQueue<TimelineEvent> | undefined {
  return _queues.get(sid);
}

/** Number of active session queues. */
export function sessionQueueCount(): number {
  return _queues.size;
}

// ---------------------------------------------------------------------------
// Message ownership (outbound tracking)
// ---------------------------------------------------------------------------

/**
 * Record that a bot message was sent by a specific session.
 * Called by outbound recording so inbound replies can route back.
 */
export function trackMessageOwner(messageId: number, sid: number): void {
  if (sid > 0) _messageOwnership.set(messageId, sid);
}

/** Look up which session sent a given bot message. Returns 0 if unknown. */
export function getMessageOwner(messageId: number): number {
  return _messageOwnership.get(messageId) ?? 0;
}

// ---------------------------------------------------------------------------
// Inbound routing
// ---------------------------------------------------------------------------

/**
 * Route an inbound event to the appropriate session queue(s).
 *
 * Routing rules:
 *   1. Targeted (reply-to, callback, reaction on owned message) → owner only
 *   2. Ambiguous (no reply context) → broadcast to all sessions
 *
 * The global queue in message-store is NOT touched here — it's
 * populated by recordInbound as before. This is additive.
 */
export function routeToSession(event: TimelineEvent, lane: "response" | "message"): void {
  if (_queues.size === 0) return;

  const targetSid = resolveTargetSession(event);

  if (targetSid > 0) {
    // Targeted: deliver only to the owning session
    const q = _queues.get(targetSid);
    if (q) {
      if (lane === "response") q.enqueueResponse(event);
      else q.enqueueMessage(event);
    }
    return;
  }

  // Ambiguous: broadcast to all sessions
  for (const q of _queues.values()) {
    if (lane === "response") q.enqueueResponse(event);
    else q.enqueueMessage(event);
  }
}

/**
 * Determine which session an inbound event is targeted at.
 * Returns the owning sid, or 0 for ambiguous.
 */
function resolveTargetSession(event: TimelineEvent): number {
  // Reply-to: user replied to a bot message owned by a session
  if (event.content.reply_to) {
    return getMessageOwner(event.content.reply_to);
  }

  // Callback/reaction: targeted at the message the button/reaction is on
  if (event.content.target) {
    return getMessageOwner(event.content.target);
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Cross-session outbound forwarding
// ---------------------------------------------------------------------------

/**
 * Forward an outbound bot event to all sessions *except* the sender.
 * Lets other sessions see what the sending session sent. Enqueued
 * to the response lane (high priority) since it's a status update,
 * not user input that blocks on processing.
 */
export function broadcastOutbound(event: TimelineEvent, senderSid: number): void {
  if (_queues.size <= 1) return;
  for (const [sid, q] of _queues) {
    if (sid === senderSid) continue;
    q.enqueueResponse(event);
  }
}

// ---------------------------------------------------------------------------
// Voice patch forwarding
// ---------------------------------------------------------------------------

/**
 * Notify session queue waiters after a voice event is patched with text.
 * Called by patchVoiceText in message-store after mutating the event.
 */
export function notifySessionWaiters(): void {
  for (const q of _queues.values()) {
    q.notifyWaiters();
  }
}

// ---------------------------------------------------------------------------
// Reset (testing only)
// ---------------------------------------------------------------------------

export function resetSessionQueuesForTest(): void {
  _queues.clear();
  _messageOwnership.clear();
}
