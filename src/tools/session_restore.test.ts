import { vi, describe, it, expect, beforeEach } from "vitest";
import { parseResult, isError, errorCode } from "./test-utils.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getRestoredSessionBySid: vi.fn(),
  markSessionRestored: vi.fn(),
  isRestoredSession: vi.fn((_sid: number) => false),
  activeSessionCount: vi.fn(() => 1),
  listSessions: vi.fn(() => [] as Array<{ sid: number; name: string; color: string; createdAt: string }>),
  deliverServiceMessage: vi.fn(),
  getSessionQueue: vi.fn(),
  createSessionQueue: vi.fn(),
  getGovernorSid: vi.fn(() => 0),
}));

vi.mock("../session-manager.js", () => ({
  getRestoredSessionBySid: mocks.getRestoredSessionBySid,
  markSessionRestored: mocks.markSessionRestored,
  isRestoredSession: mocks.isRestoredSession,
  activeSessionCount: mocks.activeSessionCount,
  listSessions: mocks.listSessions,
}));

vi.mock("../session-queue.js", () => ({
  deliverServiceMessage: mocks.deliverServiceMessage,
  getSessionQueue: mocks.getSessionQueue,
  createSessionQueue: mocks.createSessionQueue,
}));

vi.mock("../routing-mode.js", () => ({
  getGovernorSid: mocks.getGovernorSid,
}));

// Import after mocks
import { handleSessionRestore } from "./session_restore.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SID = 3;
const PIN = 456789;
const TOKEN = SID * 1_000_000 + PIN; // 3456789

function makeRestoredSession(overrides: Partial<{ pin: number; name: string; healthy: boolean }> = {}) {
  return {
    sid: SID,
    pin: PIN,
    name: "Worker",
    color: "🟩",
    createdAt: "2026-01-01T00:00:00.000Z",
    healthy: false,
    lastPollAt: undefined as number | undefined,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleSessionRestore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: queue exists with no pending messages
    mocks.getSessionQueue.mockReturnValue({ pendingCount: () => 0 });
    mocks.isRestoredSession.mockReturnValue(false);
    mocks.activeSessionCount.mockReturnValue(1);
    mocks.listSessions.mockReturnValue([
      { sid: SID, name: "Worker", color: "🟩", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  // ── Success cases ────────────────────────────────────────────────────────

  it("restores a valid token and returns action: restored", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    const result = parseResult(handleSessionRestore({ token: TOKEN }));
    expect(result.action).toBe("restored");
    expect(result.sid).toBe(SID);
    expect(result.pin).toBe(PIN);
    expect(result.token).toBe(TOKEN);
  });

  it("calls markSessionRestored with the correct sid", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    handleSessionRestore({ token: TOKEN });
    expect(mocks.markSessionRestored).toHaveBeenCalledWith(SID);
  });

  it("resets health markers on the session object", () => {
    const session = makeRestoredSession({ healthy: false });
    mocks.getRestoredSessionBySid.mockReturnValue(session);
    handleSessionRestore({ token: TOKEN });
    expect(session.healthy).toBe(true);
    expect(session.lastPollAt).toBeUndefined();
  });

  it("creates a session queue when none exists", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    mocks.getSessionQueue.mockReturnValue(undefined); // no queue exists
    handleSessionRestore({ token: TOKEN });
    expect(mocks.createSessionQueue).toHaveBeenCalledWith(SID);
  });

  it("does not create a session queue when one already exists", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    mocks.getSessionQueue.mockReturnValue({ pendingCount: () => 5 });
    handleSessionRestore({ token: TOKEN });
    expect(mocks.createSessionQueue).not.toHaveBeenCalled();
  });

  it("returns pending count from the session queue", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    mocks.getSessionQueue.mockReturnValue({ pendingCount: () => 7 });
    const result = parseResult(handleSessionRestore({ token: TOKEN }));
    expect(result.pending).toBe(7);
  });

  it("returns sessions_active from activeSessionCount", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    mocks.activeSessionCount.mockReturnValue(3);
    const result = parseResult(handleSessionRestore({ token: TOKEN }));
    expect(result.sessions_active).toBe(3);
  });

  it("delivers session_orientation service message (no operator dialog)", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    handleSessionRestore({ token: TOKEN });
    const orientationCalls = mocks.deliverServiceMessage.mock.calls.filter(
      (c: unknown[]) => c[2] === "session_orientation",
    );
    expect(orientationCalls).toHaveLength(1);
    expect(orientationCalls[0][0]).toBe(SID);
    expect(typeof orientationCalls[0][1]).toBe("string");
  });

  it("notifies confirmed live sessions of reconnect", () => {
    const fellow = { sid: 1, name: "Governor", color: "🟦", createdAt: "" };
    mocks.listSessions.mockReturnValue([
      fellow,
      { sid: SID, name: "Worker", color: "🟩", createdAt: "" },
    ]);
    mocks.isRestoredSession.mockImplementation((s: number) => s === SID); // SID still restored until markSessionRestored
    // After markSessionRestored called, SID is confirmed — we model this by returning false for fellow
    mocks.isRestoredSession.mockReturnValue(false);
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());

    handleSessionRestore({ token: TOKEN });

    const joinedCalls = mocks.deliverServiceMessage.mock.calls.filter(
      (c: unknown[]) => c[2] === "session_joined",
    );
    expect(joinedCalls.length).toBeGreaterThan(0);
    expect(joinedCalls[0][0]).toBe(fellow.sid);
  });

  // ── Error cases ──────────────────────────────────────────────────────────

  it("returns SESSION_NOT_FOUND when SID is not in restored set", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(undefined);
    const result = handleSessionRestore({ token: TOKEN });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("SESSION_NOT_FOUND");
  });

  it("returns AUTH_FAILED when PIN does not match", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession({ pin: 999999 }));
    const result = handleSessionRestore({ token: TOKEN }); // token PIN = 456789, session PIN = 999999
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("AUTH_FAILED");
  });

  it("returns AUTH_FAILED for zero or negative token", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession());
    const result = handleSessionRestore({ token: 0 });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("AUTH_FAILED");
  });

  it("does not call markSessionRestored on auth failure", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(makeRestoredSession({ pin: 999999 }));
    handleSessionRestore({ token: TOKEN });
    expect(mocks.markSessionRestored).not.toHaveBeenCalled();
  });

  it("does not deliver orientation message on failure", () => {
    mocks.getRestoredSessionBySid.mockReturnValue(undefined);
    handleSessionRestore({ token: TOKEN });
    expect(mocks.deliverServiceMessage).not.toHaveBeenCalled();
  });
});
