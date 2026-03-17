import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";
import type { TimelineEvent } from "../message-store.js";

const mocks = vi.hoisted(() => ({
  dequeueBatch: vi.fn((): TimelineEvent[] => []),
  pendingCount: vi.fn(),
  waitForEnqueue: vi.fn(),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual };
});

vi.mock("../message-store.js", () => ({
  dequeueBatch: mocks.dequeueBatch,
  pendingCount: mocks.pendingCount,
  waitForEnqueue: mocks.waitForEnqueue,
}));

import { register } from "./wait_for_message.js";

function makeEvent(id: number, text: string, event = "message" as string): TimelineEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    event,
    from: "user",
    content: { type: "text", text },
    _update: { update_id: id } as never,
  };
}

function makeVoiceEvent(id: number, text: string): TimelineEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    event: "message",
    from: "user",
    content: { type: "voice", text, file_id: `voice_${id}` },
    _update: { update_id: id } as never,
  };
}

function makeCommandEvent(id: number, command: string, args?: string): TimelineEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    event: "message",
    from: "user",
    content: { type: "command", text: command, data: args },
    _update: { update_id: id } as never,
  };
}

function makePhotoEvent(id: number, caption?: string): TimelineEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    event: "message",
    from: "user",
    content: { type: "photo", file_id: `photo_${id}`, caption },
    _update: { update_id: id } as never,
  };
}

function makeReaction(id: number, target: number): TimelineEvent {
  return {
    id: target,
    timestamp: new Date().toISOString(),
    event: "reaction",
    from: "user",
    content: { type: "reaction", target, added: ["👍"], removed: [] },
    _update: { update_id: id } as never,
  };
}

function makeCallback(id: number, target: number): TimelineEvent {
  return {
    id: target,
    timestamp: new Date().toISOString(),
    event: "callback",
    from: "user",
    content: { type: "cb", data: "btn_1", qid: `qid_${id}`, target },
    _update: { update_id: id } as never,
  };
}

describe("wait_for_message tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingCount.mockReturnValue(0);
    mocks.waitForEnqueue.mockResolvedValue(undefined);
    const server = createMockServer();
    register(server);
    call = server.getHandler("wait_for_message");
  });

  it("returns message when one is immediately queued", async () => {
    const evt = makeEvent(1, "Hello");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    expect(isError(result)).toBe(false);
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(1);
    expect(data.type).toBe("text");
    expect(data.text).toBe("Hello");
  });

  it("returns timed_out: true when no message arrives", async () => {
    mocks.dequeueBatch.mockReturnValue([]);
    mocks.waitForEnqueue.mockImplementation(
      () => new Promise<void>((r) => setTimeout(r, 50)),
    );
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(true);
  });

  it("maps text messages with flat fields", async () => {
    const evt = makeEvent(10, "Hello world");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(10);
    expect(data.type).toBe("text");
    expect(data.text).toBe("Hello world");
    expect(data.pending).toBe(0);
  });

  it("maps voice messages correctly", async () => {
    const evt = makeVoiceEvent(20, "transcribed text");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.type).toBe("voice");
    expect(data.text).toBe("transcribed text");
    expect(data.file_id).toBe("voice_20");
  });

  it("maps command messages with command and args fields", async () => {
    const evt = makeCommandEvent(30, "start", "param1 param2");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.type).toBe("command");
    expect(data.command).toBe("start");
    expect(data.args).toBe("param1 param2");
    expect(data.text).toBe("/start param1 param2");
  });

  it("maps command messages without args", async () => {
    const evt = makeCommandEvent(31, "help");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.command).toBe("help");
    expect(data.args).toBeUndefined();
    expect(data.text).toBe("/help");
  });

  it("maps media messages with file_id and caption", async () => {
    const evt = makePhotoEvent(40, "A nice photo");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.type).toBe("photo");
    expect(data.file_id).toBe("photo_40");
    expect(data.caption).toBe("A nice photo");
  });

  it("skips reactions and waits for actual message", async () => {
    const reaction = makeReaction(10, 5);
    const message = makeEvent(11, "After reaction");
    // First batch: only reaction. Second batch: message.
    mocks.dequeueBatch
      .mockReturnValueOnce([reaction])
      .mockReturnValueOnce([message]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(11);
    expect(data.text).toBe("After reaction");
  });

  it("skips callbacks and waits for actual message", async () => {
    const callback = makeCallback(10, 5);
    const message = makeEvent(12, "After callback");
    mocks.dequeueBatch
      .mockReturnValueOnce([callback])
      .mockReturnValueOnce([message]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(12);
    expect(data.text).toBe("After callback");
  });

  it("extracts message from batch containing reactions and message", async () => {
    const reaction = makeReaction(10, 5);
    const message = makeEvent(11, "Hello after reaction");
    mocks.dequeueBatch.mockReturnValueOnce([reaction, message]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(11);
    expect(data.text).toBe("Hello after reaction");
  });

  it("respects AbortSignal", async () => {
    mocks.dequeueBatch.mockReturnValue([]);
    const controller = new AbortController();
    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);
    mocks.waitForEnqueue.mockImplementation(
      () => new Promise<void>((r) => setTimeout(r, 5000)),
    );
    const result = await call(
      { timeout_seconds: 10 },
      { signal: controller.signal },
    );
    const data = parseResult(result);
    expect(data.timed_out).toBe(true);
  });

  it("defaults timeout to 300 seconds", async () => {
    // Call with empty args — zod default should kick in
    const evt = makeEvent(1, "immediate");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({});
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(1);
  });

  it("includes pending count in response", async () => {
    const evt = makeEvent(50, "test");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    mocks.pendingCount.mockReturnValue(3);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.pending).toBe(3);
  });

  it("includes pending: 0 when queue is empty", async () => {
    const evt = makeEvent(51, "test");
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    mocks.pendingCount.mockReturnValue(0);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.pending).toBe(0);
  });

  it("blocks and returns message after waitForEnqueue resolves", async () => {
    const evt = makeEvent(60, "Delayed");
    mocks.dequeueBatch.mockReturnValueOnce([]).mockReturnValueOnce([evt]);
    mocks.waitForEnqueue.mockResolvedValue(undefined);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(false);
    expect(data.message_id).toBe(60);
    expect(data.text).toBe("Delayed");
  });

  it("includes reply_to_message_id when present", async () => {
    const evt: TimelineEvent = {
      id: 70,
      timestamp: new Date().toISOString(),
      event: "message",
      from: "user",
      content: { type: "text", text: "reply text", reply_to: 42 },
      _update: { update_id: 70 } as never,
    };
    mocks.dequeueBatch.mockReturnValueOnce([evt]);
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.reply_to_message_id).toBe(42);
  });

  it("times out when only reactions arrive and no message follows", async () => {
    const reaction = makeReaction(10, 5);
    mocks.dequeueBatch
      .mockReturnValueOnce([reaction])
      .mockReturnValue([]);
    mocks.waitForEnqueue.mockImplementation(
      () => new Promise<void>((r) => setTimeout(r, 50)),
    );
    const result = await call({ timeout_seconds: 1 });
    const data = parseResult(result);
    expect(data.timed_out).toBe(true);
  });
});
