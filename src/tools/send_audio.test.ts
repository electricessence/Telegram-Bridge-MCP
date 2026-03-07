import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";

const mocks = vi.hoisted(() => ({ sendAudio: vi.fn() }));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, getApi: () => mocks, resolveChat: () => 1 };
});

import { register } from "./send_audio.js";

describe("send_audio tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("send_audio");
  });

  it("sends an audio URL and returns message_id", async () => {
    mocks.sendAudio.mockResolvedValue({ message_id: 5, chat: { id: 1 }, date: 0 });
    const result = await call({ audio: "https://example.com/track.mp3" });
    expect(isError(result)).toBe(false);
    expect((parseResult(result) as any).message_id).toBe(5);
  });

  it("validates caption length pre-send", async () => {
    const result = await call({
      audio: "https://example.com/track.mp3",
      caption: "c".repeat(1025),
    });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("CAPTION_TOO_LONG");
    expect(mocks.sendAudio).not.toHaveBeenCalled();
  });

  it("passes caption and parse_mode to API", async () => {
    mocks.sendAudio.mockResolvedValue({ message_id: 2, chat: { id: 1 }, date: 0 });
    await call({ audio: "https://x.com/t.mp3", caption: "cap", parse_mode: "HTML" });
    const [, , opts] = mocks.sendAudio.mock.calls[0];
    expect(opts.caption).toBe("cap");
    expect(opts.parse_mode).toBe("HTML");
  });

  it("passes performer, title, duration to API", async () => {
    mocks.sendAudio.mockResolvedValue({ message_id: 3, chat: { id: 1 }, date: 0 });
    await call({ audio: "https://x.com/t.mp3", performer: "Artist", title: "Track", duration: 240 });
    const [, , opts] = mocks.sendAudio.mock.calls[0];
    expect(opts.performer).toBe("Artist");
    expect(opts.title).toBe("Track");
    expect(opts.duration).toBe(240);
  });

  it("maps CHAT_NOT_FOUND from GrammyError", async () => {
    const { GrammyError } = await import("grammy");
    mocks.sendAudio.mockRejectedValue(
      new GrammyError("e", { ok: false, error_code: 400, description: "Bad Request: chat not found" }, "sendAudio", {})
    );
    const result = await call({ audio: "https://x.com/t.mp3" });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("CHAT_NOT_FOUND");
  });
});
