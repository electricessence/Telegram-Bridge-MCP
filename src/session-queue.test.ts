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
  broadcastOutbound,
  notifySessionWaiters,
  deliverDirectMessage,
  resetSessionQueuesForTest,
} from "./session-queue.js";
import {
  setRoutingMode,
  resetRoutingModeForTest,
} from "./routing-mode.js";

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
    resetRoutingModeForTest();
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
  // Routing — ambiguous (load balance, default mode = round-robin)
  // -------------------------------------------------------------------------

  describe("ambiguous routing (load balance)", () => {
    it("routes to the only idle session", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      // Make session 2 idle (waiting on dequeue)
      void getSessionQueue(2)?.waitForEnqueue();
      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
    });

    it("round-robins among idle sessions", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      createSessionQueue(3);
      void getSessionQueue(1)?.waitForEnqueue();
      void getSessionQueue(2)?.waitForEnqueue();
      void getSessionQueue(3)?.waitForEnqueue();

      // First message → session 1 (lowest SID, round-robin starts fresh)
      routeToSession(makeEvent({ id: 10 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(0);
      expect(getSessionQueue(3)?.pendingCount()).toBe(0);

      // Second message → session 2 (next idle after SID 1)
      routeToSession(makeEvent({ id: 11 }), "message");
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);

      // Third message → session 3
      routeToSession(makeEvent({ id: 12 }), "message");
      expect(getSessionQueue(3)?.pendingCount()).toBe(1);

      // Fourth message wraps back to session 1
      routeToSession(makeEvent({ id: 13 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(2);
    });

    it("skips non-idle sessions in round-robin", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      createSessionQueue(3);
      // Only sessions 1 and 3 are idle
      void getSessionQueue(1)?.waitForEnqueue();
      void getSessionQueue(3)?.waitForEnqueue();

      routeToSession(makeEvent({ id: 10 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1); // first idle

      routeToSession(makeEvent({ id: 11 }), "message");
      expect(getSessionQueue(3)?.pendingCount()).toBe(1); // next idle (skips 2)

      routeToSession(makeEvent({ id: 12 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(2); // wraps back to 1
    });

    it("falls back to round-robin among all sessions when none is idle", () => {
      createSessionQueue(3);
      createSessionQueue(5);
      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(3)?.pendingCount()).toBe(1);
      expect(getSessionQueue(5)?.pendingCount()).toBe(0);

      routeToSession(makeEvent({ id: 11 }), "message");
      expect(getSessionQueue(5)?.pendingCount()).toBe(1);
    });

    it("routes to the only session regardless of idle state", () => {
      createSessionQueue(1);
      routeToSession(makeEvent({ id: 10 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
    });

    it("no-ops when no session queues exist", () => {
      routeToSession(makeEvent(), "message");
    });
  });

  // -------------------------------------------------------------------------
  // Routing — ambiguous (cascade mode = priority hierarchy)
  // -------------------------------------------------------------------------

  describe("ambiguous routing (cascade)", () => {
    it("always routes to lowest-SID idle session", () => {
      setRoutingMode("cascade");
      createSessionQueue(1);
      createSessionQueue(2);
      void getSessionQueue(1)?.waitForEnqueue();
      void getSessionQueue(2)?.waitForEnqueue();

      // First message → session 1 (lowest SID, cascade priority)
      routeToSession(makeEvent({ id: 10 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(0);

      // Session 1's waiter is consumed. Renew it (simulates dequeue loop).
      void getSessionQueue(1)?.waitForEnqueue();

      // Second message → still session 1 (lowest SID preferred)
      routeToSession(makeEvent({ id: 11 }), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(2);
      expect(getSessionQueue(2)?.pendingCount()).toBe(0);
    });

    it("falls back to next idle session when primary is busy", () => {
      setRoutingMode("cascade");
      createSessionQueue(1);
      createSessionQueue(2);
      // Only session 2 is idle
      void getSessionQueue(2)?.waitForEnqueue();

      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
    });

    it("falls back to lowest SID when no sessions are idle", () => {
      setRoutingMode("cascade");
      createSessionQueue(3);
      createSessionQueue(5);
      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(3)?.pendingCount()).toBe(1);
      expect(getSessionQueue(5)?.pendingCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Routing — ambiguous (governor mode)
  // -------------------------------------------------------------------------

  describe("ambiguous routing (governor)", () => {
    it("routes to the governor session", () => {
      setRoutingMode("governor", 2);
      createSessionQueue(1);
      createSessionQueue(2);
      routeToSession(makeEvent(), "message");
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
    });

    it("broadcasts when governor session has no queue", () => {
      setRoutingMode("governor", 99);
      createSessionQueue(1);
      createSessionQueue(2);
      routeToSession(makeEvent(), "message");
      // Fallback: broadcast to all
      expect(getSessionQueue(1)?.pendingCount()).toBe(1);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
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
  // Cross-session outbound forwarding
  // -------------------------------------------------------------------------

  describe("broadcastOutbound", () => {
    it("forwards to all sessions except the sender", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      createSessionQueue(3);
      const evt = makeEvent({ id: 500, event: "sent", from: "bot" as const });
      broadcastOutbound(evt, 1);
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
      expect(getSessionQueue(2)?.pendingCount()).toBe(1);
      expect(getSessionQueue(3)?.pendingCount()).toBe(1);
    });

    it("no-ops when only one session exists", () => {
      createSessionQueue(1);
      const evt = makeEvent({ id: 501, event: "sent", from: "bot" as const });
      broadcastOutbound(evt, 1);
      expect(getSessionQueue(1)?.pendingCount()).toBe(0);
    });

    it("no-ops when no sessions exist", () => {
      const evt = makeEvent({ id: 502, event: "sent", from: "bot" as const });
      // Should not throw
      broadcastOutbound(evt, 1);
    });

    it("wakes waiters on receiving sessions", async () => {
      createSessionQueue(1);
      createSessionQueue(2);
      const q2 = getSessionQueue(2);
      const waiter = q2?.waitForEnqueue();
      const evt = makeEvent({ id: 503, event: "sent", from: "bot" as const });
      broadcastOutbound(evt, 1);
      await waiter;
      // waiter resolved → enqueue woke it
    });
  });

  // -------------------------------------------------------------------------
  // Ownership cleanup on remove
  // -------------------------------------------------------------------------

  describe("ownership cleanup on removeSessionQueue", () => {
    it("removes ownership entries for the closed session", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      trackMessageOwner(100, 1);
      trackMessageOwner(200, 1);
      trackMessageOwner(300, 2);
      removeSessionQueue(1);
      expect(getMessageOwner(100)).toBe(0);
      expect(getMessageOwner(200)).toBe(0);
      expect(getMessageOwner(300)).toBe(2); // other session untouched
    });

    it("no-ops cleanup when session not found", () => {
      trackMessageOwner(100, 1);
      removeSessionQueue(99); // doesn't exist
      expect(getMessageOwner(100)).toBe(1); // untouched
    });
  });

  // -------------------------------------------------------------------------
  // Direct message delivery
  // -------------------------------------------------------------------------

  describe("deliverDirectMessage", () => {
    it("delivers a DM to the target session queue", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      const delivered = deliverDirectMessage(1, 2, "hello");
      expect(delivered).toBe(true);

      const q = getSessionQueue(2);
      const batch = q?.dequeueBatch() ?? [];
      expect(batch).toHaveLength(1);
      expect(batch[0].event).toBe("direct_message");
      expect(batch[0].content.type).toBe("direct_message");
      expect(batch[0].content.text).toBe("hello");
      expect(batch[0].sid).toBe(1);
    });

    it("returns false when target queue does not exist", () => {
      createSessionQueue(1);
      expect(deliverDirectMessage(1, 99, "hi")).toBe(false);
    });

    it("assigns negative IDs to avoid collision", () => {
      createSessionQueue(2);
      deliverDirectMessage(1, 2, "a");
      deliverDirectMessage(1, 2, "b");

      const q = getSessionQueue(2);
      const first = q?.dequeueBatch() ?? [];
      const second = q?.dequeueBatch() ?? [];
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0].id).toBeLessThan(0);
      expect(second[0].id).toBeLessThan(0);
      expect(first[0].id).not.toBe(second[0].id);
    });

    it("does not enqueue to sender", () => {
      createSessionQueue(1);
      createSessionQueue(2);
      deliverDirectMessage(1, 2, "hi");

      const q1 = getSessionQueue(1);
      expect(q1?.dequeueBatch()).toHaveLength(0);
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
