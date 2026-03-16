import { describe, it, expect, beforeEach } from "vitest";
import type { TimelineEvent } from "./message-store.js";
import {
  createSessionQueue,
  removeSessionQueue,
  getSessionQueue,
  sessionQueueCount,
  trackMessageOwner,
  getMessageOwner,
  routeToSession,
  notifySessionWaiters,
  resetSessionQueuesForTest,
} from "./session-queue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 100,
    timestamp: new Date().toISOString(),
    event: "message",
    from: "user",
    content: { type: "text", text: "hello" },
    ...overrides,
  };
}

function replyEvent(replyTo: number, id = 200): TimelineEvent {
  return makeEvent({
    id,
    content: { type: "text", text: "reply", reply_to: replyTo },
  });
}

function callbackEvent(target: number, id = 300): TimelineEvent {
  return makeEvent({
    id,
    event: "callback",
    content: { type: "cb", data: "yes", target },
  });
}

function reactionEvent(target: number, id = 400): TimelineEvent {
  return makeEvent({
    id,
    event: "reaction",
    content: { type: "reaction", target, added: ["👍"] },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("session-queue", () => {
  beforeEach(() => {
    resetSessionQueuesForTest();
  });

  // -------------------------------------------------------------------------
  // Queue lifecycle
  // -------------------------------------------------------------------------

  describe("queue lifecycle", () => {
    it("creates a queue for a session", () => {
      expect(createSessionQueue(1)).toBe(true);
      expect(getSessionQueue(1)).toBeDefined();
      expect(sessionQueueCount()).toBe(1);
    });

    it("rejects duplicate creation", () => {
      createSessionQueue(1);
      expect(createSessionQueue(1)).toBe(false);
    });

    it("removes a session queue", () => {
      createSessionQueue(1);
      expect(removeSessionQueue(1)).toBe(true);
      expect(getSessionQueue(1)).toBeUndefined();
      expect(sessionQueueCount()).toBe(0);
    });

    it("returns false when removing nonexistent queue", () => {
      expect(removeSessionQueue(99)).toBe(false);
    });

    it("returns undefined for nonexistent session", () => {
      expect(getSessionQueue(42)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Message ownership
  // -------------------------------------------------------------------------

  describe("message ownership", () => {
    it("tracks and retrieves owner", () => {
      trackMessageOwner(500, 2);
      expect(getMessageOwner(500)).toBe(2);
    });

    it("returns 0 for untracked message", () => {
      expect(getMessageOwner(999)).toBe(0);
    });

    it("ignores sid 0", () => {
      trackMessageOwner(500, 0);
      expect(getMessageOwner(500)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Routing — targeted
  // -------------------------------------------------------------------------

  describe("targeted routing", () => {
    it("routes reply-to to owning session", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      trackMessageOwner(50, 1);
      routeToSession(replyEvent(50), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(0);
    });

    it("routes callback to owning session", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      trackMessageOwner(60, 2);
      routeToSession(callbackEvent(60), "response");
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
    });

    it("routes reaction to owning session", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      trackMessageOwner(70, 1);
      routeToSession(reactionEvent(70), "response");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(0);
    });

    it("drops targeted event when owner has no queue", () => {
      createSessionQueue(1);
      trackMessageOwner(80, 3); // session 3 has no queue
      routeToSession(replyEvent(80), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Routing — ambiguous (broadcast)
  // -------------------------------------------------------------------------

  describe("ambiguous routing (broadcast)", () => {
    it("broadcasts message to all sessions", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      createSessionQueue(3);
      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
      expect(getSessionQueue(3)?.pendingCount()).toBe(1);
    });

    it("broadcasts response event to all sessions", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      // Reaction on an unowned message → ambiguous
      routeToSession(reactionEvent(999), "response");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
    });

    it("no-ops when no session queues exist", () => {
      // Should not throw
      routeToSession(makeEvent(), "message");
    });
  });

  // -------------------------------------------------------------------------
  // Dequeue from session queue
  // -------------------------------------------------------------------------

  describe("session queue dequeue", () => {
    it("dequeues events from session queue", () => {
      createSessionQueue(1);
      routeToSession(makeEvent({ id: 10 }), "message");
      const q = getSessionQueue(1);
      const evt = q?.dequeue();
      expect(evt?.id).toBe(10);
    });

    it("dequeueBatch drains response + 1 message", () => {
      createSessionQueue(1);
      routeToSession(callbackEvent(0, 10), "response");
      routeToSession(callbackEvent(0, 11), "response");
      routeToSession(makeEvent({ id: 20 }), "message");
      routeToSession(makeEvent({ id: 21 }), "message");
      const q = getSessionQueue(1);
      const batch = q?.dequeueBatch() ?? [];
      expect(batch).toHaveLength(3);
      expect(q?.pendingCount()).toBe(1);
    });

    it("tracks consumed IDs", () => {
      createSessionQueue(1);
      routeToSession(makeEvent({ id: 42 }), "message");
      const q = getSessionQueue(1);
      q?.dequeue();
      expect(q?.isConsumed(42)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Voice patch forwarding
  // -------------------------------------------------------------------------

  describe("notifySessionWaiters", () => {
    it("wakes waiters on all session queues", async () => {
      createSessionQueue(1);
      createSessionQueue(2);
      const q1 = getSessionQueue(1);
      const q2 = getSessionQueue(2);
      const p1 = q1?.waitForEnqueue();
      const p2 = q2?.waitForEnqueue();
      notifySessionWaiters();
      await p1;
      await p2;
      // If we got here, both resolved
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  describe("reset", () => {
    it("clears all queues and ownership", () => {
      createSessionQueue(1);
      trackMessageOwner(100, 1);
      resetSessionQueuesForTest();
      expect(sessionQueueCount()).toBe(0);
      expect(getMessageOwner(100)).toBe(0);
    });
  });
});
