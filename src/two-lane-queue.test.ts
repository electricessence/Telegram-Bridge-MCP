import { describe, it, expect, beforeEach } from "vitest";
import { TwoLaneQueue } from "./two-lane-queue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestItem {
  id: number;
  type: string;
  text?: string;
  ready?: boolean;
}

function makeQueue(opts?: { maxSize?: number }) {
  return new TwoLaneQueue<TestItem>({
    maxSize: opts?.maxSize,
    isReady: (item) => item.ready !== false,
    getId: (item) => item.id,
  });
}

function msg(id: number, text = "hello"): TestItem {
  return { id, type: "message", text };
}

function response(id: number, type = "callback"): TestItem {
  return { id, type };
}

function voicePending(id: number): TestItem {
  return { id, type: "voice", ready: false };
}

function _voiceReady(id: number, text: string): TestItem {
  return { id, type: "voice", text, ready: true };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TwoLaneQueue", () => {
  let q: TwoLaneQueue<TestItem>;

  beforeEach(() => {
    q = makeQueue();
  });

  // -------------------------------------------------------------------------
  // Basic enqueue / dequeue
  // -------------------------------------------------------------------------

  describe("dequeue", () => {
    it("returns undefined when empty", () => {
      expect(q.dequeue()).toBeUndefined();
    });

    it("returns a message-lane item", () => {
      q.enqueueMessage(msg(1));
      expect(q.dequeue()).toEqual(msg(1));
    });

    it("returns a response-lane item", () => {
      q.enqueueResponse(response(1));
      expect(q.dequeue()).toEqual(response(1));
    });

    it("drains response lane before message lane", () => {
      q.enqueueMessage(msg(1));
      q.enqueueResponse(response(2));
      expect(q.dequeue()).toEqual(response(2));
      expect(q.dequeue()).toEqual(msg(1));
    });

    it("skips not-ready items", () => {
      q.enqueueMessage(voicePending(1));
      q.enqueueMessage(msg(2));
      expect(q.dequeue()).toEqual(msg(2));
      // voice-pending item remains queued
      expect(q.pendingCount()).toBe(1);
    });

    it("returns not-ready item once it becomes ready", () => {
      const pending = voicePending(1);
      q.enqueueMessage(pending);
      expect(q.dequeue()).toBeUndefined();
      // Mutate in-place (simulating patchVoiceText)
      pending.ready = true;
      pending.text = "transcribed";
      expect(q.dequeue()?.text).toBe("transcribed");
    });
  });

  // -------------------------------------------------------------------------
  // Batch dequeue
  // -------------------------------------------------------------------------

  describe("dequeueBatch", () => {
    it("returns empty array when empty", () => {
      expect(q.dequeueBatch()).toEqual([]);
    });

    it("drains all response items + one message", () => {
      q.enqueueResponse(response(1));
      q.enqueueResponse(response(2));
      q.enqueueMessage(msg(3));
      q.enqueueMessage(msg(4));
      const batch = q.dequeueBatch();
      expect(batch).toHaveLength(3);
      expect(batch[0]).toEqual(response(1));
      expect(batch[1]).toEqual(response(2));
      expect(batch[2]).toEqual(msg(3));
      // msg(4) remains
      expect(q.pendingCount()).toBe(1);
    });

    it("returns only response items when no messages", () => {
      q.enqueueResponse(response(1));
      q.enqueueResponse(response(2));
      const batch = q.dequeueBatch();
      expect(batch).toHaveLength(2);
    });

    it("returns single message when no responses", () => {
      q.enqueueMessage(msg(1));
      const batch = q.dequeueBatch();
      expect(batch).toEqual([msg(1)]);
    });

    it("skips not-ready messages", () => {
      q.enqueueMessage(voicePending(1));
      q.enqueueMessage(msg(2));
      const batch = q.dequeueBatch();
      expect(batch).toEqual([msg(2)]);
      expect(q.pendingCount()).toBe(1);
    });

    it("consecutive batches drain completely", () => {
      q.enqueueMessage(msg(1));
      q.enqueueMessage(msg(2));
      q.enqueueMessage(msg(3));
      expect(q.dequeueBatch()).toHaveLength(1);
      expect(q.dequeueBatch()).toHaveLength(1);
      expect(q.dequeueBatch()).toHaveLength(1);
      expect(q.dequeueBatch()).toEqual([]);
    });

    it("handles 200 response items in single pass", () => {
      for (let i = 1; i <= 200; i++) q.enqueueResponse(response(i));
      q.enqueueMessage(msg(201));
      const batch = q.dequeueBatch();
      expect(batch).toHaveLength(201);
      expect(batch[0]).toEqual(response(1));
      expect(batch[199]).toEqual(response(200));
      expect(batch[200]).toEqual(msg(201));
      expect(q.pendingCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // dequeueMatch
  // -------------------------------------------------------------------------

  describe("dequeueMatch", () => {
    it("extracts matching item from response lane", () => {
      q.enqueueResponse(response(1, "reaction"));
      q.enqueueResponse(response(2, "callback"));
      const result = q.dequeueMatch((item) =>
        item.type === "callback" ? item : undefined,
      );
      expect(result).toEqual(response(2, "callback"));
      expect(q.pendingCount()).toBe(1);
    });

    it("extracts matching item from message lane", () => {
      q.enqueueMessage(msg(1, "no"));
      q.enqueueMessage(msg(2, "yes"));
      const result = q.dequeueMatch((item) =>
        item.text === "yes" ? item : undefined,
      );
      expect(result).toEqual(msg(2, "yes"));
      expect(q.pendingCount()).toBe(1);
    });

    it("returns undefined when nothing matches", () => {
      q.enqueueMessage(msg(1));
      const result = q.dequeueMatch((item) =>
        item.id === 999 ? true : undefined,
      );
      expect(result).toBeUndefined();
      expect(q.pendingCount()).toBe(1);
    });

    it("checks response lane first", () => {
      q.enqueueResponse(response(1, "target"));
      q.enqueueMessage({ id: 2, type: "target" });
      const result = q.dequeueMatch((item) =>
        item.type === "target" ? item : undefined,
      );
      expect(result?.id).toBe(1);
      expect(q.pendingCount()).toBe(1);
    });

    it("transforms the match result", () => {
      q.enqueueMessage(msg(1, "hello"));
      const result = q.dequeueMatch((item) =>
        item.text === "hello" ? `found-${item.id}` : undefined,
      );
      expect(result).toBe("found-1");
    });
  });

  // -------------------------------------------------------------------------
  // pendingCount
  // -------------------------------------------------------------------------

  describe("pendingCount", () => {
    it("starts at zero", () => {
      expect(q.pendingCount()).toBe(0);
    });

    it("reflects items across both lanes", () => {
      q.enqueueResponse(response(1));
      q.enqueueMessage(msg(2));
      q.enqueueMessage(msg(3));
      expect(q.pendingCount()).toBe(3);
    });

    it("decrements on dequeue", () => {
      q.enqueueMessage(msg(1));
      q.dequeue();
      expect(q.pendingCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Consumed tracking
  // -------------------------------------------------------------------------

  describe("consumed tracking", () => {
    it("tracks dequeued message IDs", () => {
      q.enqueueMessage(msg(42));
      expect(q.isConsumed(42)).toBe(false);
      q.dequeue();
      expect(q.isConsumed(42)).toBe(true);
    });

    it("tracks batch-dequeued IDs", () => {
      q.enqueueResponse(response(10));
      q.enqueueMessage(msg(20));
      q.dequeueBatch();
      expect(q.isConsumed(10)).toBe(true);
      expect(q.isConsumed(20)).toBe(true);
    });

    it("tracks dequeueMatch IDs", () => {
      q.enqueueMessage(msg(7));
      q.dequeueMatch((item) => (item.id === 7 ? true : undefined));
      expect(q.isConsumed(7)).toBe(true);
    });

    it("does not track ID 0", () => {
      const noId = new TwoLaneQueue<TestItem>({
        getId: () => 0,
      });
      noId.enqueueMessage(msg(1));
      noId.dequeue();
      expect(noId.isConsumed(0)).toBe(false);
    });

    it("survives clear", () => {
      q.enqueueMessage(msg(1));
      q.dequeue();
      q.clear();
      // clear resets consumed IDs
      expect(q.isConsumed(1)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Waiters
  // -------------------------------------------------------------------------

  describe("waiters", () => {
    it("resolves on enqueueMessage", async () => {
      const p = q.waitForEnqueue();
      q.enqueueMessage(msg(1));
      await p; // should resolve
    });

    it("resolves on enqueueResponse", async () => {
      const p = q.waitForEnqueue();
      q.enqueueResponse(response(1));
      await p;
    });

    it("resolves on notifyWaiters()", async () => {
      const p = q.waitForEnqueue();
      q.notifyWaiters();
      await p;
    });

    it("hasPendingWaiters reflects blocked callers", () => {
      expect(q.hasPendingWaiters()).toBe(false);
      void q.waitForEnqueue();
      expect(q.hasPendingWaiters()).toBe(true);
    });

    it("waiters are one-shot", async () => {
      const p = q.waitForEnqueue();
      q.enqueueMessage(msg(1));
      await p;
      expect(q.hasPendingWaiters()).toBe(false);
    });

    it("dequeueMatch wakes waiters on match", async () => {
      q.enqueueMessage(msg(1));
      const p = q.waitForEnqueue();
      q.dequeueMatch((item) => (item.id === 1 ? true : undefined));
      await p;
    });

    it("dequeueMatch does NOT wake waiters on miss", () => {
      q.enqueueMessage(msg(1));
      void q.waitForEnqueue();
      q.dequeueMatch((): undefined => undefined);
      expect(q.hasPendingWaiters()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Capacity limits
  // -------------------------------------------------------------------------

  describe("capacity limits", () => {
    it("caps message lane at maxSize", () => {
      const small = makeQueue({ maxSize: 3 });
      small.enqueueMessage(msg(1));
      small.enqueueMessage(msg(2));
      small.enqueueMessage(msg(3));
      small.enqueueMessage(msg(4)); // evicts msg(1)
      expect(small.pendingCount()).toBe(3);
      expect(small.dequeue()?.id).toBe(2);
    });

    it("caps response lane at maxSize", () => {
      const small = makeQueue({ maxSize: 2 });
      small.enqueueResponse(response(1));
      small.enqueueResponse(response(2));
      small.enqueueResponse(response(3)); // evicts response(1)
      expect(small.pendingCount()).toBe(2);
      expect(small.dequeue()?.id).toBe(2);
    });

    it("defaults to 5000", () => {
      // Just verify we can enqueue a lot without error
      for (let i = 0; i < 100; i++) q.enqueueMessage(msg(i));
      expect(q.pendingCount()).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Clear
  // -------------------------------------------------------------------------

  describe("clear", () => {
    it("empties both lanes and resets waiters", () => {
      q.enqueueResponse(response(1));
      q.enqueueMessage(msg(2));
      void q.waitForEnqueue();
      q.clear();
      expect(q.pendingCount()).toBe(0);
      expect(q.hasPendingWaiters()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Default options
  // -------------------------------------------------------------------------

  describe("default options", () => {
    it("works with no options (everything is ready, no ID tracking)", () => {
      const bare = new TwoLaneQueue<{ value: string }>();
      bare.enqueueMessage({ value: "a" });
      expect(bare.dequeue()).toEqual({ value: "a" });
    });
  });
});
