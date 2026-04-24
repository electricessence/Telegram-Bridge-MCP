import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  answerCallbackQuery: vi.fn(),
  editMessageText: vi.fn(),
  dequeueMatch: vi.fn(),
  waitForEnqueue: vi.fn(),
  ackVoiceMessage: vi.fn(),
  sessionQueue: {
    dequeueMatch: vi.fn(),
    waitForEnqueue: vi.fn(),
  },
  sessionQueue2: {
    dequeueMatch: vi.fn(),
    waitForEnqueue: vi.fn(),
  },
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getApi: () => mocks,
    resolveChat: () => 42,
    ackVoiceMessage: mocks.ackVoiceMessage,
  };
});

vi.mock("../message-store.js", () => ({
  dequeueMatch: mocks.dequeueMatch,
  waitForEnqueue: mocks.waitForEnqueue,
}));

vi.mock("../session-queue.js", () => ({
  getSessionQueue: (sid: number) => {
    if (sid === 1) return mocks.sessionQueue;
    if (sid === 2) return mocks.sessionQueue2;
    return undefined;
  },
}));

import {
  ackAndEditSelection,
  editWithTimedOut,
  editWithSkipped,
  pollButtonPress,
  pollButtonOrTextOrVoice,
  buildHighlightedRows,
} from "./button-helpers.js";

describe("button-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ackAndEditSelection", () => {
    it("edits message with chosen label and removes buttons", async () => {
      mocks.answerCallbackQuery.mockResolvedValue(true);
      mocks.editMessageText.mockResolvedValue(true);
      await ackAndEditSelection(42, 1, "Question?", "Yes", "cq1");
      expect(mocks.answerCallbackQuery).toHaveBeenCalledWith("cq1");
      expect(mocks.editMessageText).toHaveBeenCalledWith(
        42, 1, expect.stringContaining("Yes"),
        expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
      );
    });

    it("skips answerCallbackQuery when callbackQueryId is undefined", async () => {
      mocks.editMessageText.mockResolvedValue(true);
      await ackAndEditSelection(42, 1, "Question?", "Yes", undefined);
      expect(mocks.answerCallbackQuery).not.toHaveBeenCalled();
    });

    it("swallows answerCallbackQuery errors (already answered, etc.)", async () => {
      mocks.answerCallbackQuery.mockRejectedValue(new Error("Already answered"));
      mocks.editMessageText.mockResolvedValue(true);
      await expect(ackAndEditSelection(42, 1, "Question?", "Yes", "cq1")).resolves.toBeUndefined();
    });

    it("swallows editMessageText errors silently", async () => {
      mocks.answerCallbackQuery.mockResolvedValue(true);
      mocks.editMessageText.mockRejectedValue(new Error("Message not modified"));
      await expect(ackAndEditSelection(42, 1, "Question?", "Yes", "cq1")).resolves.toBeUndefined();
    });

    it("passes highlighted keyboard when highlightedRows is provided", async () => {
      mocks.answerCallbackQuery.mockResolvedValue(true);
      mocks.editMessageText.mockResolvedValue(true);
      const rows = [[
        { text: "Yes", callback_data: "yes", style: "primary" as const },
        { text: "No", callback_data: "no" },
      ]];
      await ackAndEditSelection(42, 1, "Question?", "Yes", "cq1", false, rows);
      expect(mocks.editMessageText).toHaveBeenCalledWith(
        42, 1, expect.any(String),
        expect.objectContaining({ reply_markup: { inline_keyboard: rows } }),
      );
    });

    it("removes buttons when highlightedRows is omitted", async () => {
      mocks.answerCallbackQuery.mockResolvedValue(true);
      mocks.editMessageText.mockResolvedValue(true);
      await ackAndEditSelection(42, 1, "Question?", "Yes", "cq1");
      expect(mocks.editMessageText).toHaveBeenCalledWith(
        42, 1, expect.any(String),
        expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
      );
    });
  });

  describe("buildHighlightedRows", () => {
    it("sets clicked button to primary style", () => {
      const opts = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ];
      const rows = buildHighlightedRows(opts, 2, "a");
      expect(rows).toEqual([[
        { text: "A", callback_data: "a", style: "primary" },
        { text: "B", callback_data: "b" },
      ]]);
    });

    it("leaves non-clicked buttons without added style", () => {
      const opts = [
        { label: "X", value: "x" },
        { label: "Y", value: "y" },
        { label: "Z", value: "z" },
      ];
      const rows = buildHighlightedRows(opts, 3, "z");
      expect(rows[0][0]).not.toHaveProperty("style");
      expect(rows[0][1]).not.toHaveProperty("style");
      expect(rows[0][2]).toMatchObject({ style: "primary" });
    });

    it("preserves existing style on non-clicked buttons", () => {
      const opts = [
        { label: "Good", value: "good", style: "success" as const },
        { label: "Bad", value: "bad", style: "danger" as const },
      ];
      const rows = buildHighlightedRows(opts, 2, "bad");
      expect(rows[0][0]).toMatchObject({ style: "success" });
      expect(rows[0][1]).toMatchObject({ style: "primary" });
    });

    it("respects column layout", () => {
      const opts = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
        { label: "C", value: "c" },
      ];
      const rows = buildHighlightedRows(opts, 1, "b");
      expect(rows).toHaveLength(3);
      expect(rows[1][0]).toMatchObject({ style: "primary" });
    });

    it("applies no highlight when clickedValue does not match any option", () => {
      const opts = [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ];
      const rows = buildHighlightedRows(opts, 2, "ghost");
      expect(rows[0][0]).not.toHaveProperty("style");
      expect(rows[0][1]).not.toHaveProperty("style");
    });
  });

  describe("editWithTimedOut", () => {
    it("edits message to show timed-out indicator and removes buttons", async () => {
      mocks.editMessageText.mockResolvedValue(true);
      await editWithTimedOut(42, 1, "Question?");
      expect(mocks.editMessageText).toHaveBeenCalledWith(
        42, 1, expect.stringContaining("Timed out"),
        expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
      );
    });

    it("swallows editMessageText errors silently", async () => {
      mocks.editMessageText.mockRejectedValue(new Error("Message not modified"));
      await expect(editWithTimedOut(42, 1, "Question?")).resolves.toBeUndefined();
    });
  });

  describe("editWithSkipped", () => {
    it("edits message to show skipped indicator and removes buttons", async () => {
      mocks.editMessageText.mockResolvedValue(true);
      await editWithSkipped(42, 1, "Question?");
      expect(mocks.editMessageText).toHaveBeenCalledWith(
        42, 1, expect.stringContaining("Skipped"),
        expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
      );
    });

    it("swallows editMessageText errors silently", async () => {
      mocks.editMessageText.mockRejectedValue(new Error("Message not modified"));
      await expect(editWithSkipped(42, 1, "Question?")).resolves.toBeUndefined();
    });
  });

  // -- pollButtonPress -----------------------------------------------------

  describe("pollButtonPress", () => {
    it("returns button result when callback matches", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "callback",
          content: { target: 10, qid: "q1", data: "yes" },
        });
      });
      const result = await pollButtonPress(123, 10, 1);
      expect(result).toEqual({
        kind: "button",
        callback_query_id: "q1",
        data: "yes",
        message_id: 10,
      });
    });

    it("returns null on timeout with no match", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      mocks.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      const result = await pollButtonPress(123, 10, 0.01);
      expect(result).toBeNull();
    });

    it("ignores callbacks for different message_id", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "callback",
          content: { target: 999, qid: "q1", data: "no" },
        });
      });
      mocks.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      const result = await pollButtonPress(123, 10, 0.01);
      expect(result).toBeNull();
    });
    it("returns null when signal is pre-aborted", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      mocks.waitForEnqueue.mockImplementation(() => new Promise(() => {})); // never resolves
      const controller = new AbortController();
      controller.abort();
      const result = await pollButtonPress(123, 10, 10, controller.signal);
      expect(result).toBeNull();
    });

    it("returns null when signal is aborted during wait", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      let resolveEnqueue!: () => void;
      mocks.waitForEnqueue.mockImplementation(() => new Promise<void>((r) => { resolveEnqueue = r; }));
      const controller = new AbortController();
      const resultPromise = pollButtonPress(123, 10, 10, controller.signal);
      controller.abort();
      resolveEnqueue();
      const result = await resultPromise;
      expect(result).toBeNull();
    });
  });

  // -- pollButtonOrTextOrVoice ---------------------------------------------

  describe("pollButtonOrTextOrVoice", () => {
    it("returns null when signal is pre-aborted", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      mocks.waitForEnqueue.mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();
      controller.abort();
      const result = await pollButtonOrTextOrVoice(123, 10, 10, undefined, controller.signal);
      expect(result).toBeNull();
    });

    it("returns null when signal is aborted during wait", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      let resolveEnqueue!: () => void;
      mocks.waitForEnqueue.mockImplementation(() => new Promise<void>((r) => { resolveEnqueue = r; }));
      const controller = new AbortController();
      const resultPromise = pollButtonOrTextOrVoice(123, 10, 10, undefined, controller.signal);
      controller.abort();
      resolveEnqueue();
      const result = await resultPromise;
      expect(result).toBeNull();
    });

    it("returns button result for matching callback", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "callback",
          content: { target: 10, qid: "q1", data: "a" },
        });
      });
      const result = await pollButtonOrTextOrVoice(123, 10, 1);
      expect(result).toEqual({
        kind: "button",
        callback_query_id: "q1",
        data: "a",
        message_id: 10,
      });
    });

    it("returns text result for text message after question", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "message",
          id: 11,
          content: { type: "text", text: "typed answer" },
        });
      });
      const result = await pollButtonOrTextOrVoice(123, 10, 1);
      expect(result).toEqual({
        kind: "text",
        message_id: 11,
        text: "typed answer",
      });
    });

    it("returns voice result for voice message", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "message",
          id: 11,
          content: { type: "voice", text: "transcribed" },
        });
      });
      const result = await pollButtonOrTextOrVoice(123, 10, 1);
      expect(result).toEqual({
        kind: "voice",
        message_id: 11,
        text: "transcribed",
      });
    });

    it("sets 🫡 reaction on voice message dequeue", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "message",
          id: 11,
          content: { type: "voice", text: "hello" },
        });
      });
      await pollButtonOrTextOrVoice(123, 10, 1);
      expect(mocks.ackVoiceMessage).toHaveBeenCalledWith(11);
    });

    it("ignores messages with id <= question id", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        // Message with same ID as question — should not match
        return fn({
          event: "message",
          id: 10,
          content: { type: "text", text: "stale" },
        });
      });
      mocks.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      const result = await pollButtonOrTextOrVoice(123, 10, 0.01);
      expect(result).toBeNull();
    });

    it("returns null on timeout", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      mocks.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      const result = await pollButtonOrTextOrVoice(123, 10, 0.01);
      expect(result).toBeNull();
    });

    // Issue #4 — commands during button/text wait
    it("returns command as break signal instead of ignoring (#4)", async () => {
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        return fn({
          event: "message",
          id: 11,
          content: { type: "command", text: "cancel" },
        });
      });
      const result = await pollButtonOrTextOrVoice(123, 10, 1);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("command");
    });

    it("fires onVoiceDetected immediately when voice arrives without transcription", async () => {
      // First call: voice with no text (pending transcription)
      // Second call: same voice with text (transcription done)
      let callCount = 0;
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        callCount++;
        if (callCount === 1) {
          fn({ event: "message", id: 11, content: { type: "voice" } }); // no text yet
          return undefined;
        }
        return fn({ event: "message", id: 11, content: { type: "voice", text: "done" } });
      });
      mocks.waitForEnqueue.mockResolvedValue(undefined);

      const onVoiceDetected = vi.fn();
      const result = await pollButtonOrTextOrVoice(123, 10, 1, onVoiceDetected);

      expect(onVoiceDetected).toHaveBeenCalledOnce();
      expect(result).toEqual({ kind: "voice", message_id: 11, text: "done" });
    });

    it("fires onVoiceDetected only once even across multiple loops", async () => {
      let callCount = 0;
      mocks.dequeueMatch.mockImplementation((fn: (e: unknown) => unknown) => {
        callCount++;
        if (callCount <= 2) {
          fn({ event: "message", id: 11, content: { type: "voice" } }); // no text
          return undefined;
        }
        return fn({ event: "message", id: 11, content: { type: "voice", text: "ready" } });
      });
      mocks.waitForEnqueue.mockResolvedValue(undefined);

      const onVoiceDetected = vi.fn();
      await pollButtonOrTextOrVoice(123, 10, 1, onVoiceDetected);

      expect(onVoiceDetected).toHaveBeenCalledOnce();
    });
  });

  // -- session-aware polling -----------------------------------------------

  describe("session-aware polling", () => {
    beforeEach(() => {
      mocks.sessionQueue.dequeueMatch.mockReset();
      mocks.sessionQueue.waitForEnqueue.mockReset();
      mocks.sessionQueue2.dequeueMatch.mockReset();
      mocks.sessionQueue2.waitForEnqueue.mockReset();
    });

    it("pollButtonPress uses session queue when sid is provided", async () => {
      mocks.sessionQueue.dequeueMatch.mockImplementation(
        (fn: (e: unknown) => unknown) =>
          fn({ event: "callback", content: { target: 10, qid: "q1", data: "yes" } }),
      );
      const result = await pollButtonPress(123, 10, 1, undefined, 1);
      expect(result).toEqual({
        kind: "button",
        callback_query_id: "q1",
        data: "yes",
        message_id: 10,
      });
      expect(mocks.sessionQueue.dequeueMatch).toHaveBeenCalled();
      expect(mocks.dequeueMatch).not.toHaveBeenCalled();
    });

    it("pollButtonPress falls back to global when sid is 0", async () => {
      mocks.dequeueMatch.mockImplementation(
        (fn: (e: unknown) => unknown) =>
          fn({ event: "callback", content: { target: 10, qid: "q2", data: "no" } }),
      );
      const result = await pollButtonPress(123, 10, 1, undefined, 0);
      expect(mocks.dequeueMatch).toHaveBeenCalled();
      expect(mocks.sessionQueue.dequeueMatch).not.toHaveBeenCalled();
      expect(result?.data).toBe("no");
    });

    it("pollButtonOrTextOrVoice uses session queue when sid > 0", async () => {
      mocks.sessionQueue.dequeueMatch.mockImplementation(
        (fn: (e: unknown) => unknown) =>
          fn({ event: "message", id: 11, content: { type: "text", text: "hi" } }),
      );
      const result = await pollButtonOrTextOrVoice(
        123, 10, 1, undefined, undefined, 1,
      );
      expect(result).toEqual({ kind: "text", message_id: 11, text: "hi" });
      expect(mocks.sessionQueue.dequeueMatch).toHaveBeenCalled();
      expect(mocks.dequeueMatch).not.toHaveBeenCalled();
    });

    it("pollButtonOrTextOrVoice waits on session queue", async () => {
      mocks.sessionQueue.dequeueMatch.mockReturnValue(undefined);
      mocks.sessionQueue.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      const result = await pollButtonOrTextOrVoice(
        123, 10, 0.01, undefined, undefined, 1,
      );
      expect(result).toBeNull();
      expect(mocks.sessionQueue.waitForEnqueue).toHaveBeenCalled();
      expect(mocks.waitForEnqueue).not.toHaveBeenCalled();
    });

    it("pollButtonPress falls back to global for unknown sid", async () => {
      mocks.dequeueMatch.mockReturnValue(undefined);
      mocks.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );
      // sid=999 has no queue — falls back to global
      const result = await pollButtonPress(123, 10, 0.01, undefined, 999);
      expect(mocks.dequeueMatch).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("session 1's callback is invisible to session 2's poll", async () => {
      // Session 1 has a matching callback event sitting in its queue
      mocks.sessionQueue.dequeueMatch.mockImplementation(
        (fn: (e: unknown) => unknown) =>
          fn({ event: "callback", content: { target: 10, qid: "q-s1", data: "s1-result" } }),
      );
      // Session 2's queue is empty — times out immediately
      mocks.sessionQueue2.dequeueMatch.mockReturnValue(undefined);
      mocks.sessionQueue2.waitForEnqueue.mockImplementation(
        () => new Promise((r) => setTimeout(r, 100)),
      );

      // Session 2 polls — must not consume session 1's event
      const result = await pollButtonOrTextOrVoice(123, 10, 0.01, undefined, undefined, 2);
      expect(result).toBeNull();
      // Session 2's own queue was used
      expect(mocks.sessionQueue2.dequeueMatch).toHaveBeenCalled();
      // Session 1's queue was never touched
      expect(mocks.sessionQueue.dequeueMatch).not.toHaveBeenCalled();
    });
  });
});
