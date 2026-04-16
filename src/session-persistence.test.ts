import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Helpers ───────────────────────────────────────────────────────────────────

const _MOCK_STATE_PATH = "/tmp/test-session-state.json";

// We re-import with adjusted SESSION_STATE_PATH by mocking fs.
// Since SESSION_STATE_PATH is a computed constant (resolve), we mock the fs
// operations and SESSION_STATE_PATH so tests don't touch the real file.

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  stderrWrite: vi.fn(),
  // module-level mocks for imported modules in saveSessionState
  listSessions: vi.fn(() => []),
  getSession: vi.fn(),
  getGovernorSid: vi.fn(() => 0),
  getPollerOffset: vi.fn(() => 0),
  // session-manager restore tracking
  resetRestoredSids: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: mocks.existsSync,
  writeFileSync: mocks.writeFileSync,
  readFileSync: mocks.readFileSync,
  renameSync: mocks.renameSync,
  unlinkSync: mocks.unlinkSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock("./session-manager.js", () => ({
  listSessions: mocks.listSessions,
  getSession: mocks.getSession,
  resetRestoredSids: mocks.resetRestoredSids,
}));

vi.mock("./routing-mode.js", () => ({
  getGovernorSid: mocks.getGovernorSid,
}));

vi.mock("./telegram.js", () => ({
  getPollerOffset: mocks.getPollerOffset,
}));

// Import after mocking
import {
  loadSessionState,
  clearSessionState,
  saveSessionState,
  expireRestoredSessions,
  SESSION_STATE_PATH,
} from "./session-persistence.js";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("loadSessionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(mocks.stderrWrite);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when file does not exist", () => {
    mocks.existsSync.mockReturnValue(false);
    expect(loadSessionState()).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue("not valid json");
    expect(loadSessionState()).toBeNull();
  });

  it("returns null when version field is missing", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({
      governorSid: 1,
      pollerOffset: 100,
      sessions: [],
      // no version field
    }));
    expect(loadSessionState()).toBeNull();
  });

  it("returns null when version field does not match", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({
      version: 99,
      governorSid: 1,
      pollerOffset: 100,
      sessions: [],
    }));
    expect(loadSessionState()).toBeNull();
  });

  it("returns null when sessions is not an array", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify({
      version: 1,
      governorSid: 1,
      pollerOffset: 100,
      sessions: "bad",
    }));
    expect(loadSessionState()).toBeNull();
  });

  it("returns the parsed snapshot on valid data", () => {
    const snapshot = {
      version: 1,
      governorSid: 2,
      pollerOffset: 42,
      sessions: [
        { sid: 1, pin: 123456, name: "Governor", color: "🟦", createdAt: "2026-01-01T00:00:00.000Z" },
        { sid: 2, pin: 654321, name: "Worker", color: "🟩", createdAt: "2026-01-01T00:01:00.000Z" },
      ],
    };
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue(JSON.stringify(snapshot));
    const result = loadSessionState();
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.governorSid).toBe(2);
    expect(result!.pollerOffset).toBe(42);
    expect(result!.sessions).toHaveLength(2);
    expect(result!.sessions[0].sid).toBe(1);
    expect(result!.sessions[1].name).toBe("Worker");
  });

  it("returns null when parsed value is null", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue("null");
    expect(loadSessionState()).toBeNull();
  });

  it("returns null when read throws", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementation(() => { throw new Error("EACCES"); });
    expect(loadSessionState()).toBeNull();
  });
});

describe("clearSessionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(mocks.stderrWrite);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when file does not exist", () => {
    mocks.existsSync.mockReturnValue(false);
    expect(() => {
      clearSessionState();
    }).not.toThrow();
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it("deletes the file when it exists", () => {
    mocks.existsSync.mockReturnValue(true);
    clearSessionState();
    expect(mocks.unlinkSync).toHaveBeenCalledWith(SESSION_STATE_PATH);
  });

  it("swallows unlink errors without throwing", () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.unlinkSync.mockImplementation(() => { throw new Error("EBUSY"); });
    expect(() => {
      clearSessionState();
    }).not.toThrow();
  });
});

describe("saveSessionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(mocks.stderrWrite);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to a tmp file then renames atomically", async () => {
    mocks.listSessions.mockReturnValue([
      { sid: 1, name: "Gov", color: "🟦", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    mocks.getSession.mockReturnValue({ pin: 111111, dequeueDefault: undefined });
    mocks.getGovernorSid.mockReturnValue(1);
    mocks.getPollerOffset.mockReturnValue(500);

    await saveSessionState();

    expect(mocks.writeFileSync).toHaveBeenCalledTimes(1);
    const [writePath, content] = mocks.writeFileSync.mock.calls[0] as [string, string, string];
    expect(writePath).toBe(SESSION_STATE_PATH + ".tmp");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(parsed.governorSid).toBe(1);
    expect(parsed.pollerOffset).toBe(500);
    expect((parsed.sessions as unknown[]).length).toBe(1);

    expect(mocks.renameSync).toHaveBeenCalledWith(
      SESSION_STATE_PATH + ".tmp",
      SESSION_STATE_PATH,
    );
  });

  it("calls mkdirSync with recursive: true before writing", async () => {
    mocks.listSessions.mockReturnValue([]);
    mocks.getGovernorSid.mockReturnValue(0);
    mocks.getPollerOffset.mockReturnValue(0);

    await saveSessionState();

    expect(mocks.mkdirSync).toHaveBeenCalledTimes(1);
    const [dirArg, optsArg] = mocks.mkdirSync.mock.calls[0] as [string, { recursive: boolean }];
    // The dir must be the parent of the snapshot file (the 'data' directory)
    expect(dirArg).toMatch(/data$/);
    expect(optsArg).toEqual({ recursive: true });
    // mkdirSync must be called before writeFileSync
    const mkdirOrder = mocks.mkdirSync.mock.invocationCallOrder[0];
    const writeOrder = mocks.writeFileSync.mock.invocationCallOrder[0];
    expect(writeOrder).toBeDefined();
    expect(mkdirOrder).toBeLessThan(writeOrder ?? 0);
  });

  it("includes dequeueDefault when set on the session", async () => {
    mocks.listSessions.mockReturnValue([
      { sid: 2, name: "Worker", color: "🟩", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    mocks.getSession.mockReturnValue({ pin: 222222, dequeueDefault: 60 });
    mocks.getGovernorSid.mockReturnValue(0);
    mocks.getPollerOffset.mockReturnValue(0);

    await saveSessionState();

    const [, content] = mocks.writeFileSync.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { sessions: Array<{ dequeueDefault?: number }> };
    expect(parsed.sessions[0].dequeueDefault).toBe(60);
  });

  it("omits dequeueDefault when not set", async () => {
    mocks.listSessions.mockReturnValue([
      { sid: 3, name: "W2", color: "🟨", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);
    mocks.getSession.mockReturnValue({ pin: 333333, dequeueDefault: undefined });
    mocks.getGovernorSid.mockReturnValue(0);
    mocks.getPollerOffset.mockReturnValue(0);

    await saveSessionState();

    const [, content] = mocks.writeFileSync.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { sessions: Array<{ dequeueDefault?: number }> };
    expect(Object.prototype.hasOwnProperty.call(parsed.sessions[0], "dequeueDefault")).toBe(false);
  });

  it("writes an empty sessions array when no sessions exist", async () => {
    mocks.listSessions.mockReturnValue([]);
    mocks.getGovernorSid.mockReturnValue(0);
    mocks.getPollerOffset.mockReturnValue(0);

    await saveSessionState();

    const [, content] = mocks.writeFileSync.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as { sessions: unknown[] };
    expect(parsed.sessions).toEqual([]);
  });
});

describe("expireRestoredSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(mocks.stderrWrite);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls resetRestoredSids to clear the in-memory restored-SID set", async () => {
    mocks.existsSync.mockReturnValue(false); // no snapshot file to delete
    await expireRestoredSessions();
    expect(mocks.resetRestoredSids).toHaveBeenCalledOnce();
  });

  it("deletes the snapshot file when it exists", async () => {
    mocks.existsSync.mockReturnValue(true);
    await expireRestoredSessions();
    expect(mocks.unlinkSync).toHaveBeenCalledWith(SESSION_STATE_PATH);
  });

  it("is a no-op on snapshot deletion when file does not exist", async () => {
    mocks.existsSync.mockReturnValue(false);
    await expireRestoredSessions();
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it("still calls resetRestoredSids even if snapshot file is missing", async () => {
    mocks.existsSync.mockReturnValue(false);
    await expireRestoredSessions();
    expect(mocks.resetRestoredSids).toHaveBeenCalledOnce();
  });

  it("is safe to call multiple times", async () => {
    mocks.existsSync.mockReturnValue(false);
    await expireRestoredSessions();
    await expireRestoredSessions();
    expect(mocks.resetRestoredSids).toHaveBeenCalledTimes(2);
  });
});

describe("SESSION_STATE_PATH", () => {
  it("resolves to a path containing data/session-snapshot.json", () => {
    expect(SESSION_STATE_PATH).toMatch(/data[/\\]session-snapshot\.json$/);
  });
});
