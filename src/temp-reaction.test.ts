import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  setMessageReaction: vi.fn(),
  trySetMessageReaction: vi.fn(),
  getBotReaction: vi.fn<(messageId: number) => string | null>().mockReturnValue(null),
}));

vi.mock("./message-store.js", () => ({
  getBotReaction: mocks.getBotReaction,
}));

vi.mock("./telegram.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    resolveChat: () => 42,
    getApi: () => ({ setMessageReaction: mocks.setMessageReaction }),
    trySetMessageReaction: mocks.trySetMessageReaction,
  };
});

import {
  setTempReaction,
  fireTempReactionRestore,
  hasTempReaction,
  resetTempReactionForTest,
} from "./temp-reaction.js";
import { runInSessionContext } from "./session-context.js";

describe("temp-reaction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetTempReactionForTest();
    mocks.trySetMessageReaction.mockResolvedValue(true);
    mocks.setMessageReaction.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetTempReactionForTest();
  });

  it("sets a reaction and records the slot", async () => {
    const ok = await setTempReaction(100, "👀");
    expect(ok).toBe(true);
    expect(hasTempReaction()).toBe(true);
    expect(mocks.trySetMessageReaction).toHaveBeenCalledWith(42, 100, "👀");
  });

  it("restore fires restore_emoji on next outbound", async () => {
    await setTempReaction(100, "👀", "🫡" as never);
    await fireTempReactionRestore();
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 100, "🫡");
    expect(hasTempReaction()).toBe(false);
  });

  it("clears reaction when no restore_emoji and no previous reaction recorded", async () => {
    await setTempReaction(100, "\uD83D\uDC40");
    await fireTempReactionRestore();
    // Initial set + clear (empty array via setMessageReaction)
    expect(mocks.trySetMessageReaction).toHaveBeenCalledTimes(1);
    expect(mocks.setMessageReaction).toHaveBeenCalledWith(42, 100, []);
    expect(hasTempReaction()).toBe(false);
  });

  it("is a no-op when no slot is active", async () => {
    await fireTempReactionRestore();
    expect(mocks.trySetMessageReaction).not.toHaveBeenCalled();
  });

  it("auto-reverts after timeout_seconds", async () => {
    await setTempReaction(100, "👀", "🫡" as never, 30);
    expect(hasTempReaction()).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 100, "🫡");
    expect(hasTempReaction()).toBe(false);
  });

  it("replacing slot cancels previous without restoring", async () => {
    await setTempReaction(100, "👀", "🫡" as never);
    vi.clearAllMocks();
    await setTempReaction(200, "🤔", "✅" as never);
    // Should NOT have fired the 🫡 restore for the first slot
    expect(mocks.trySetMessageReaction).toHaveBeenCalledTimes(1);
    expect(mocks.trySetMessageReaction).toHaveBeenCalledWith(42, 200, "🤔");
    expect(hasTempReaction()).toBe(true);
  });

  it("replacing temp on same message restores to original stable reaction, not intermediate temp", async () => {
    // Permanent reaction 👍 is the stable state
    mocks.getBotReaction.mockReturnValue("👍");

    // First temp 👀 — restore target captured from getBotReaction → 👍
    await setTempReaction(100, "👀" as never);

    // Simulate handleSetReaction recording 👀 as the new bot reaction
    mocks.getBotReaction.mockReturnValue("👀");
    vi.clearAllMocks();

    // Second temp 🤔 on the same message — should inherit restore target 👍 from outgoing slot
    await setTempReaction(100, "🤔" as never);

    // Restore must resolve to 👍, not 👀
    await fireTempReactionRestore();
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 100, "👍");
  });

  it("replacing temp on a different message does not inherit restore from old slot", async () => {
    // Slot on message 100 with restore 🫡
    mocks.getBotReaction.mockReturnValue("🫡");
    await setTempReaction(100, "👀" as never);

    // New temp on message 200 — different message, restore comes from getBotReaction(200)
    mocks.getBotReaction.mockReturnValue("❤" as never);
    vi.clearAllMocks();
    await setTempReaction(200, "🤔" as never);

    await fireTempReactionRestore();
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 200, "❤");
  });

  it("auto-restores to previously recorded reaction when restore_emoji is omitted", async () => {
    mocks.getBotReaction.mockReturnValue("🫡");
    await setTempReaction(100, "👀");
    await fireTempReactionRestore();
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 100, "🫡");
    expect(mocks.setMessageReaction).not.toHaveBeenCalled();
  });

  it("clears reaction if no previous reaction recorded and no restore_emoji", async () => {
    mocks.getBotReaction.mockReturnValue(null);
    await setTempReaction(100, "\uD83D\uDC40");
    await fireTempReactionRestore();
    expect(mocks.setMessageReaction).toHaveBeenCalledWith(42, 100, []);
    expect(hasTempReaction()).toBe(false);
  });

  it("timeout restore uses set-time SID even when ALS context is lost in callback", async () => {
    // setTempReaction runs inside ALS context for SID 7
    await runInSessionContext(7, () => setTempReaction(100, "👀", "🫡" as never, 5));

    // Verify slot is active for SID 7
    expect(runInSessionContext(7, () => hasTempReaction())).toBe(true);

    // Advance timers — the callback fires outside any ALS context (getCallerSid() → 0)
    await vi.advanceTimersByTimeAsync(5_000);

    // Restore must have fired for SID 7, not SID 0
    expect(mocks.trySetMessageReaction).toHaveBeenLastCalledWith(42, 100, "🫡");
    expect(runInSessionContext(7, () => hasTempReaction())).toBe(false);
  });
});
