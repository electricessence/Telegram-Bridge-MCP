import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseResult, isError } from "./test-utils.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(() => true),
  listSessions: vi.fn(() => [] as Array<{ sid: number; name: string; color: string; createdAt: string }>),
  deliverDirectMessage: vi.fn(() => true),
  elegantShutdown: vi.fn((_planned?: boolean): Promise<never> => new Promise(() => {})),
}));

vi.mock("../session-manager.js", () => ({
  validateSession: mocks.validateSession,
  listSessions: mocks.listSessions,
}));

vi.mock("../session-queue.js", () => ({
  deliverDirectMessage: (...args: unknown[]) => mocks.deliverDirectMessage(...args),
}));

vi.mock("../shutdown.js", () => ({
  elegantShutdown: (...args: unknown[]) => mocks.elegantShutdown(...args),
}));

// Import after mocks
import { handleSessionBounce } from "./session_bounce.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GOV_SID = 1;
const GOV_PIN = 111111;
const GOV_TOKEN = GOV_SID * 1_000_000 + GOV_PIN; // 1111111

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleSessionBounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.validateSession.mockReturnValue(true);
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Success cases ────────────────────────────────────────────────────────

  it("returns bouncing: true", () => {
    const result = parseResult(handleSessionBounce({ token: GOV_TOKEN }));
    expect(result.bouncing).toBe(true);
  });

  it("includes a hint about session/restore in the response", () => {
    const result = parseResult(handleSessionBounce({ token: GOV_TOKEN }));
    expect(typeof result.hint).toBe("string");
    expect((result.hint as string).toLowerCase()).toContain("session/restore");
  });

  it("notifies other sessions before shutdown", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    const result = parseResult(handleSessionBounce({ token: GOV_TOKEN }));
    expect(result.sessions_notified).toBe(1);
    expect(mocks.deliverDirectMessage).toHaveBeenCalledTimes(1);
    const [fromSid, toSid] = mocks.deliverDirectMessage.mock.calls[0] as [number, number, string];
    expect(fromSid).toBe(GOV_SID);
    expect(toSid).toBe(2);
  });

  it("does not notify the calling session itself", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
    ]);
    const result = parseResult(handleSessionBounce({ token: GOV_TOKEN }));
    expect(result.sessions_notified).toBe(0);
    expect(mocks.deliverDirectMessage).not.toHaveBeenCalled();
  });

  it("notification message mentions session/restore token", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    handleSessionBounce({ token: GOV_TOKEN });
    const [, , text] = mocks.deliverDirectMessage.mock.calls[0] as [number, number, string];
    expect(text).toContain("session/restore");
  });

  it("includes reason in notification when provided", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    handleSessionBounce({ token: GOV_TOKEN, reason: "code update" });
    const [, , text] = mocks.deliverDirectMessage.mock.calls[0] as [number, number, string];
    expect(text).toContain("code update");
  });

  it("includes wait_seconds in notification when provided", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    handleSessionBounce({ token: GOV_TOKEN, wait_seconds: 45 });
    const [, , text] = mocks.deliverDirectMessage.mock.calls[0] as [number, number, string];
    expect(text).toContain("45");
  });

  it("triggers elegantShutdown(true) via setImmediate", () => {
    handleSessionBounce({ token: GOV_TOKEN });
    expect(mocks.elegantShutdown).not.toHaveBeenCalled(); // not called yet
    vi.runAllTimers(); // flush setImmediate
    expect(mocks.elegantShutdown).toHaveBeenCalledTimes(1);
    expect(mocks.elegantShutdown).toHaveBeenCalledWith(true);
  });

  it("notifies multiple other sessions", () => {
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker1", color: "🟩", createdAt: "" },
      { sid: 3, name: "Worker2", color: "🟨", createdAt: "" },
    ]);
    const result = parseResult(handleSessionBounce({ token: GOV_TOKEN }));
    expect(result.sessions_notified).toBe(2);
    expect(mocks.deliverDirectMessage).toHaveBeenCalledTimes(2);
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  it("returns error when auth fails", () => {
    mocks.validateSession.mockReturnValue(false);
    const result = handleSessionBounce({ token: 9999999 });
    expect(isError(result)).toBe(true);
  });

  it("does not trigger shutdown when auth fails", () => {
    mocks.validateSession.mockReturnValue(false);
    handleSessionBounce({ token: 9999999 });
    vi.runAllTimers();
    expect(mocks.elegantShutdown).not.toHaveBeenCalled();
  });

  it("does not notify sessions when auth fails", () => {
    mocks.validateSession.mockReturnValue(false);
    mocks.listSessions.mockReturnValue([
      { sid: GOV_SID, name: "Governor", color: "🟦", createdAt: "" },
      { sid: 2, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    handleSessionBounce({ token: 9999999 });
    expect(mocks.deliverDirectMessage).not.toHaveBeenCalled();
  });
});
