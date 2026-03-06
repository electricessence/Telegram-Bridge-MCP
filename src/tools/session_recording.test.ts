import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const recMocks = vi.hoisted(() => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  isRecording: vi.fn(() => false),
  recordedCount: vi.fn(() => 0),
  getSessionEntries: vi.fn(() => [] as any[]),
  getRecordedUpdates: vi.fn(() => [] as any[]),
  clearRecording: vi.fn(),
  getMaxUpdates: vi.fn(() => 50),
}));


vi.mock("../session-recording.js", () => recMocks);

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, filterAllowedUpdates: (u: unknown[]) => u };
});

vi.mock("../transcribe.js", () => ({
  transcribeWithIndicator: vi.fn().mockResolvedValue("transcribed"),
}));

import { register as registerStart } from "./start_session_recording.js";
import { register as registerCancel } from "./cancel_session_recording.js";
import { register as registerGet } from "./get_session_updates.js";
import { register as registerDump } from "./dump_session_record.js";

// ── start_session_recording ───────────────────────────────────────────────

describe("start_session_recording tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    registerStart(server as any);
    call = server.getHandler("start_session_recording");
  });

  it("calls startRecording with default max_updates=50", async () => {
    const result = await call({});
    expect(isError(result)).toBe(false);
    expect(recMocks.startRecording).toHaveBeenCalledWith(50);
    const data = parseResult(result) as any;
    expect(data.recording).toBe(true);
    expect(data.max_updates).toBe(50);
  });

  it("passes custom max_updates", async () => {
    await call({ max_updates: 100 });
    expect(recMocks.startRecording).toHaveBeenCalledWith(100);
  });

  it("reports reset:true when was already recording", async () => {
    recMocks.isRecording.mockReturnValue(true);
    const result = await call({});
    const data = parseResult(result) as any;
    expect(data.reset).toBe(true);
  });

  it("reports reset:false when was not recording", async () => {
    recMocks.isRecording.mockReturnValue(false);
    const result = await call({});
    const data = parseResult(result) as any;
    expect(data.reset).toBe(false);
  });

  it("includes captured count in response", async () => {
    recMocks.recordedCount.mockReturnValue(7);
    const result = await call({});
    const data = parseResult(result) as any;
    expect(data.captured).toBe(7);
  });
});

// ── cancel_session_recording ─────────────────────────────────────────────

describe("cancel_session_recording tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    registerCancel(server as any);
    call = server.getHandler("cancel_session_recording");
  });

  it("calls stopRecording and clearRecording, returns recording:false", async () => {
    recMocks.isRecording.mockReturnValue(true);
    const result = await call({});
    expect(isError(result)).toBe(false);
    expect(recMocks.stopRecording).toHaveBeenCalledOnce();
    expect(recMocks.clearRecording).toHaveBeenCalledOnce();
    const data = parseResult(result) as any;
    expect(data.recording).toBe(false);
    expect(data.was_active).toBe(true);
  });

  it("reports was_active:false when not recording", async () => {
    recMocks.isRecording.mockReturnValue(false);
    const result = await call({});
    const data = parseResult(result) as any;
    expect(data.was_active).toBe(false);
  });
});

// ── get_session_updates ──────────────────────────────────────────────────

describe("get_session_updates tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  const makeUpdate = (id: number, text: string) => ({
    update_id: id,
    message: { message_id: id, text, chat: { id: 42 } },
  });
  const makeEntry = (id: number, text: string) => ({ direction: "user" as const, update: makeUpdate(id, text) });

  beforeEach(() => {
    vi.clearAllMocks();
    recMocks.isRecording.mockReturnValue(true);
    recMocks.recordedCount.mockReturnValue(0);
    recMocks.getSessionEntries.mockReturnValue([]);
    const server = createMockServer();
    registerGet(server as any);
    call = server.getHandler("get_session_updates");
  });

  it("returns empty updates with recording state", async () => {
    const result = await call({});
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.updates).toEqual([]);
    expect(data.recording).toBe(true);
    expect(data.returned).toBe(0);
  });

  it("returns newest-first by default", async () => {
    const entries = [makeEntry(1, "first"), makeEntry(2, "second"), makeEntry(3, "third")];
    recMocks.getSessionEntries.mockReturnValue(entries);
    recMocks.recordedCount.mockReturnValue(3);

    const result = await call({});
    const data = parseResult(result) as any;
    // sanitizer maps update_id→message_id; fixture uses same number for both
    expect(data.updates[0].message_id).toBe(3);
    expect(data.updates[2].message_id).toBe(1);
  });

  it("returns oldest-first when oldest_first=true", async () => {
    const entries = [makeEntry(1, "first"), makeEntry(2, "second"), makeEntry(3, "third")];
    recMocks.getSessionEntries.mockReturnValue(entries);

    const result = await call({ oldest_first: true });
    const data = parseResult(result) as any;
    expect(data.updates[0].message_id).toBe(1);
    expect(data.updates[2].message_id).toBe(3);
  });

  it("respects messages param", async () => {
    const entries = [makeEntry(1, "a"), makeEntry(2, "b"), makeEntry(3, "c"), makeEntry(4, "d")];
    recMocks.getSessionEntries.mockReturnValue(entries);
    recMocks.recordedCount.mockReturnValue(4);

    const result = await call({ messages: 2 });
    const data = parseResult(result) as any;
    expect(data.returned).toBe(2);
    expect(data.updates).toHaveLength(2);
    // newest-first default → message_ids 4, 3
    expect(data.updates[0].message_id).toBe(4);
  });

  it("sanitizes updates (text → content_type=text)", async () => {
    recMocks.getSessionEntries.mockReturnValue([makeEntry(10, "hello")]);
    recMocks.recordedCount.mockReturnValue(1);

    const result = await call({});
    const data = parseResult(result) as any;
    expect(data.updates[0].text).toBe("hello");
    expect(data.updates[0].content_type).toBe("text");
  });

  it("reports total_captured separately from returned", async () => {
    const entries = [makeEntry(1, "a"), makeEntry(2, "b"), makeEntry(3, "c")];
    recMocks.getSessionEntries.mockReturnValue(entries);
    recMocks.recordedCount.mockReturnValue(3);

    const result = await call({ messages: 1 });
    const data = parseResult(result) as any;
    expect(data.total_captured).toBe(3);
    expect(data.returned).toBe(1);
  });
});

// ── dump_session_record ──────────────────────────────────────────────────

describe("dump_session_record tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  const getText = (result: unknown) =>
    (result as { content: { text: string }[] }).content[0].text;

  const makeEntry = (id: number, text: string) => ({
    direction: "user" as const,
    update: { update_id: id, message: { message_id: id, text, chat: { id: 42 } } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    recMocks.isRecording.mockReturnValue(false);
    recMocks.recordedCount.mockReturnValue(0);
    recMocks.getSessionEntries.mockReturnValue([]);
    recMocks.getMaxUpdates.mockReturnValue(50);
    const server = createMockServer();
    registerDump(server as any);
    call = server.getHandler("dump_session_record");
  });

  it("returns plain text (not JSON-wrapped)", async () => {
    const result = await call({ clean: false });
    expect(isError(result)).toBe(false);
    const text = getText(result);
    expect(typeof text).toBe("string");
    expect(text).toContain("Session Recording Log");
  });

  it("includes header metadata", async () => {
    recMocks.isRecording.mockReturnValue(true);
    recMocks.recordedCount.mockReturnValue(3);
    recMocks.getMaxUpdates.mockReturnValue(100);
    const result = await call({ clean: false });
    const text = getText(result);
    expect(text).toContain("Recording: active");
    expect(text).toContain("Updates: 3 / 100");
  });

  it("formats text messages in the log", async () => {
    recMocks.getSessionEntries.mockReturnValue([makeEntry(7, "Hello world")]);
    recMocks.recordedCount.mockReturnValue(1);
    const result = await call({ clean: false });
    const text = getText(result);
    expect(text).toContain("message · text");
    expect(text).toContain("msg_id: 7");
    expect(text).toContain("Hello world");
  });

  it("shows (no updates captured) when buffer is empty", async () => {
    const result = await call({ clean: false });
    const text = getText(result);
    expect(text).toContain("(no updates captured)");
  });

  it("labels user messages with [USER]", async () => {
    recMocks.getSessionEntries.mockReturnValue([makeEntry(3, "Hey bot!")]);
    recMocks.recordedCount.mockReturnValue(1);
    const text = getText(await call({}));
    expect(text).toContain("[USER]");
    expect(text).toContain("Hey bot!");
  });

  it("labels bot messages with [BOT]", async () => {
    const botEntry = {
      direction: "bot" as const,
      timestamp: "2026-03-06T00:00:00.000Z",
      content_type: "text",
      text: "Hello from the bot!",
      message_id: 99,
    };
    recMocks.getSessionEntries.mockReturnValue([botEntry]);
    recMocks.recordedCount.mockReturnValue(1);
    const text = getText(await call({}));
    expect(text).toContain("[BOT]");
    expect(text).toContain("Hello from the bot!");
    expect(text).toContain("msg_id: 99");
  });

  it("interleaves [USER] and [BOT] entries in order", async () => {
    const entries = [
      {
        direction: "user" as const,
        update: { update_id: 1, message: { message_id: 1, text: "What time is it?", chat: { id: 42 } } },
      },
      {
        direction: "bot" as const,
        timestamp: "2026-03-06T00:00:01.000Z",
        content_type: "text",
        text: "It is noon.",
        message_id: 2,
      },
      {
        direction: "user" as const,
        update: { update_id: 3, message: { message_id: 3, text: "Thanks!", chat: { id: 42 } } },
      },
    ];
    recMocks.getSessionEntries.mockReturnValue(entries);
    recMocks.recordedCount.mockReturnValue(3);
    const text = getText(await call({}));

    // All three entries appear
    expect(text).toContain("What time is it?");
    expect(text).toContain("It is noon.");
    expect(text).toContain("Thanks!");

    // Order: [USER] before [BOT] before [USER]
    const userIdx1 = text.indexOf("[1] [USER]");
    const botIdx   = text.indexOf("[2] [BOT]");
    const userIdx2 = text.indexOf("[3] [USER]");
    expect(userIdx1).toBeLessThan(botIdx);
    expect(botIdx).toBeLessThan(userIdx2);
  });

  it("bot voice entry shows content_type voice", async () => {
    const botEntry = {
      direction: "bot" as const,
      timestamp: "2026-03-06T00:00:02.000Z",
      content_type: "voice",
      text: "Spoken reply text",
      message_id: 5,
    };
    recMocks.getSessionEntries.mockReturnValue([botEntry]);
    recMocks.recordedCount.mockReturnValue(1);
    const text = getText(await call({}));
    expect(text).toContain("[BOT] voice");
    expect(text).toContain("Spoken reply text");
  });

  it("calls clearRecording when clean=true", async () => {
    await call({ clean: true });
    expect(recMocks.clearRecording).toHaveBeenCalledOnce();
    expect(recMocks.stopRecording).not.toHaveBeenCalled();
  });

  it("does NOT call clearRecording when neither clean nor stop is set", async () => {
    await call({});
    expect(recMocks.clearRecording).not.toHaveBeenCalled();
    expect(recMocks.stopRecording).not.toHaveBeenCalled();
  });

  it("calls stopRecording and clearRecording when stop=true", async () => {
    recMocks.isRecording.mockReturnValue(true);
    await call({ stop: true });
    expect(recMocks.stopRecording).toHaveBeenCalledOnce();
    expect(recMocks.clearRecording).toHaveBeenCalledOnce();
  });

  it("stop=true takes precedence over clean=true (stop+clear, not double-clear)", async () => {
    await call({ clean: true, stop: true });
    expect(recMocks.stopRecording).toHaveBeenCalledOnce();
    expect(recMocks.clearRecording).toHaveBeenCalledOnce();
  });
});
