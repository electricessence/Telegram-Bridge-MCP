import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  editMessageText: vi.fn(),
  deleteMessage: vi.fn(),
  resolveChat: vi.fn((): number => 123),
  recordOutgoing: vi.fn(),
}));

vi.mock("./telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("./telegram.js")>();
  return {
    ...actual,
    getApi: () => ({
      sendMessage: mocks.sendMessage,
      editMessageText: mocks.editMessageText,
      deleteMessage: mocks.deleteMessage,
    }),
    resolveChat: mocks.resolveChat,
  };
});

vi.mock("./message-store.js", () => ({
  recordOutgoing: mocks.recordOutgoing,
}));

import {
  startAnimation,
  cancelAnimation,
  resetAnimationTimeout,
  getAnimationMessageId,
  isAnimationActive,
  resetAnimationForTest,
} from "./animation-state.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("animation-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetAnimationForTest();
    mocks.sendMessage.mockResolvedValue({ message_id: 42 });
    mocks.editMessageText.mockResolvedValue(undefined);
    mocks.deleteMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetAnimationForTest();
    vi.useRealTimers();
  });

  // -- startAnimation -------------------------------------------------------

  describe("startAnimation", () => {
    it("sends the first frame as a message", async () => {
      await startAnimation(["🔄", "🔃"]);

      expect(mocks.sendMessage).toHaveBeenCalledWith(123, "🔄", { parse_mode: "MarkdownV2" });
    });

    it("returns the message_id of the sent message", async () => {
      const id = await startAnimation();
      expect(id).toBe(42);
    });

    it("sets animation as active", async () => {
      expect(isAnimationActive()).toBe(false);
      await startAnimation();
      expect(isAnimationActive()).toBe(true);
    });

    it("uses default frames when none provided", async () => {
      await startAnimation();
      expect(mocks.sendMessage).toHaveBeenCalledWith(123, "`...`", { parse_mode: "MarkdownV2" });
    });

    it("cancels previous animation before starting new one", async () => {
      mocks.sendMessage
        .mockResolvedValueOnce({ message_id: 42 })
        .mockResolvedValueOnce({ message_id: 99 });

      await startAnimation(["A"]);
      expect(getAnimationMessageId()).toBe(42);

      await startAnimation(["B"]);
      // Old message should have been deleted
      expect(mocks.deleteMessage).toHaveBeenCalledWith(123, 42);
      expect(getAnimationMessageId()).toBe(99);
    });

    it("throws if resolveChat returns non-number", async () => {
      mocks.resolveChat.mockReturnValueOnce("not_a_number" as unknown as number);

      await expect(startAnimation()).rejects.toThrow("ALLOWED_CHAT_ID not configured");
    });
  });

  // -- Frame cycling --------------------------------------------------------

  describe("frame cycling", () => {
    it("edits message text on interval", async () => {
      await startAnimation(["A", "B", "C"], 2000);

      // Advance past one interval
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).toHaveBeenCalledWith(123, 42, "B", { parse_mode: "MarkdownV2" });

      // Second interval
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).toHaveBeenCalledWith(123, 42, "C", { parse_mode: "MarkdownV2" });

      // Third interval wraps back to first
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).toHaveBeenCalledWith(123, 42, "A", { parse_mode: "MarkdownV2" });
    });

    it("does not cycle with single frame", async () => {
      await startAnimation(["only"], 2000);

      await vi.advanceTimersByTimeAsync(10000);
      // editMessageText should not be called for cycling (only potentially for cancel)
      expect(mocks.editMessageText).not.toHaveBeenCalled();
    });

    it("enforces minimum interval of 1000ms", async () => {
      await startAnimation(["A", "B"], 200);

      // At 200ms — should not have cycled yet
      await vi.advanceTimersByTimeAsync(200);
      expect(mocks.editMessageText).not.toHaveBeenCalled();

      // At 1000ms — should cycle
      await vi.advanceTimersByTimeAsync(800);
      expect(mocks.editMessageText).toHaveBeenCalledWith(123, 42, "B", { parse_mode: "MarkdownV2" });
    });

    it("skips API call for identical consecutive frames", async () => {
      await startAnimation(["A", "A", "A", "B"], 2000);

      // A→A: skip (no edit)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).not.toHaveBeenCalled();

      // A→A: skip again
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).not.toHaveBeenCalled();

      // A→B: sends
      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.editMessageText).toHaveBeenCalledOnce();
      expect(mocks.editMessageText).toHaveBeenCalledWith(123, 42, "B", { parse_mode: "MarkdownV2" });
    });

    it("swallows errors from editMessageText during cycling", async () => {
      mocks.editMessageText.mockRejectedValueOnce(new Error("rate limited"));
      await startAnimation(["A", "B"], 2000);

      // Should not throw
      await vi.advanceTimersByTimeAsync(2000);
      expect(isAnimationActive()).toBe(true);
    });
  });

  // -- cancelAnimation ------------------------------------------------------

  describe("cancelAnimation", () => {
    it("returns { cancelled: false } when no animation active", async () => {
      const result = await cancelAnimation();
      expect(result).toEqual({ cancelled: false });
    });

    it("returns { cancelled: true } after stopping active animation", async () => {
      await startAnimation();
      const result = await cancelAnimation();
      expect(result).toEqual({ cancelled: true });
    });

    it("deletes the animation message when no replacement text", async () => {
      await startAnimation();
      await cancelAnimation();

      expect(mocks.deleteMessage).toHaveBeenCalledWith(123, 42);
    });

    it("replaces animation with text when provided", async () => {
      await startAnimation();
      const result = await cancelAnimation("Done!", "Markdown");

      expect(mocks.editMessageText).toHaveBeenCalledWith(
        123, 42,
        expect.any(String),
        expect.objectContaining({ parse_mode: expect.any(String) }),
      );
      expect(result).toEqual({ cancelled: true, message_id: 42 });
    });

    it("records outgoing message when replacing with text", async () => {
      await startAnimation();
      await cancelAnimation("Final result", "Markdown");

      expect(mocks.recordOutgoing).toHaveBeenCalledWith(42, "text", "Final result");
    });

    it("does not delete when replacing with text", async () => {
      await startAnimation();
      await cancelAnimation("Replaced");

      expect(mocks.deleteMessage).not.toHaveBeenCalledWith(123, 42);
    });

    it("sets isAnimationActive to false", async () => {
      await startAnimation();
      expect(isAnimationActive()).toBe(true);
      await cancelAnimation();
      expect(isAnimationActive()).toBe(false);
    });

    it("stops frame cycling", async () => {
      await startAnimation(["A", "B"], 2000);
      await cancelAnimation();

      mocks.editMessageText.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      // No more cycling edits after cancel
      expect(mocks.editMessageText).not.toHaveBeenCalled();
    });

    it("handles editMessageText failure gracefully on replacement", async () => {
      mocks.editMessageText.mockRejectedValueOnce(new Error("msg deleted"));
      await startAnimation();
      const result = await cancelAnimation("text", "Markdown");

      expect(result).toEqual({ cancelled: true });
      expect(result.message_id).toBeUndefined();
    });

    it("handles deleteMessage failure gracefully", async () => {
      mocks.deleteMessage.mockRejectedValueOnce(new Error("already deleted"));
      await startAnimation();

      // Should not throw
      const result = await cancelAnimation();
      expect(result).toEqual({ cancelled: true });
    });
  });

  // -- getAnimationMessageId ------------------------------------------------

  describe("getAnimationMessageId", () => {
    it("returns null when no animation", () => {
      expect(getAnimationMessageId()).toBeNull();
    });

    it("returns message_id when animation is active", async () => {
      await startAnimation();
      expect(getAnimationMessageId()).toBe(42);
    });

    it("returns null after cancel", async () => {
      await startAnimation();
      await cancelAnimation();
      expect(getAnimationMessageId()).toBeNull();
    });
  });

  // -- resetAnimationForTest ------------------------------------------------

  describe("resetAnimationForTest", () => {
    it("clears state without API calls", async () => {
      await startAnimation();
      mocks.sendMessage.mockClear();
      mocks.editMessageText.mockClear();
      mocks.deleteMessage.mockClear();

      resetAnimationForTest();

      expect(isAnimationActive()).toBe(false);
      expect(getAnimationMessageId()).toBeNull();
      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(mocks.editMessageText).not.toHaveBeenCalled();
      expect(mocks.deleteMessage).not.toHaveBeenCalled();
    });

    it("stops timers so no further cycling occurs", async () => {
      await startAnimation(["A", "B"], 2000);
      resetAnimationForTest();

      mocks.editMessageText.mockClear();
      await vi.advanceTimersByTimeAsync(10000);
      expect(mocks.editMessageText).not.toHaveBeenCalled();
    });
  });

  // -- resetAnimationTimeout ------------------------------------------------

  describe("resetAnimationTimeout", () => {
    it("does nothing when no animation is active", () => {
      // Should not throw
      resetAnimationTimeout();
    });

    it("extends the auto-cancel timeout", async () => {
      await startAnimation(["⏳"], 2000, 5); // 5 second timeout

      // Advance 4 seconds (just before timeout)
      await vi.advanceTimersByTimeAsync(4000);
      expect(isAnimationActive()).toBe(true);

      // Reset the timeout
      resetAnimationTimeout();

      // Advance another 4 seconds (would have expired without reset)
      await vi.advanceTimersByTimeAsync(4000);
      expect(isAnimationActive()).toBe(true);

      // Now let the full timeout expire from reset point
      await vi.advanceTimersByTimeAsync(1000);
      expect(isAnimationActive()).toBe(false);
    });
  });

  // -- Auto-timeout ---------------------------------------------------------

  describe("auto-timeout", () => {
    it("cancels animation after timeout expires", async () => {
      await startAnimation(["⏳"], 2000, 3); // 3 second timeout

      expect(isAnimationActive()).toBe(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(isAnimationActive()).toBe(false);
    });

    it("deletes message on auto-timeout", async () => {
      await startAnimation(["⏳"], 2000, 2);

      await vi.advanceTimersByTimeAsync(2000);
      expect(mocks.deleteMessage).toHaveBeenCalledWith(123, 42);
    });

    it("caps timeout at 600 seconds", async () => {
      await startAnimation(["⏳"], 2000, 9999);

      // At 600 seconds it should auto-cancel
      await vi.advanceTimersByTimeAsync(600_000);
      expect(isAnimationActive()).toBe(false);
    });
  });
});
