import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";

const mocks = vi.hoisted(() => ({ sendVideo: vi.fn() }));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, getApi: () => mocks, resolveChat: () => 1 };
});

import { register } from "./send_video.js";

describe("send_video tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("send_video");
  });

  it("sends a video URL and returns message_id", async () => {
    mocks.sendVideo.mockResolvedValue({ message_id: 7, chat: { id: 1 }, date: 0 });
    const result = await call({ video: "https://example.com/clip.mp4" });
    expect(isError(result)).toBe(false);
    expect((parseResult(result) as any).message_id).toBe(7);
  });

  it("validates caption length pre-send", async () => {
    const result = await call({
      video: "https://example.com/clip.mp4",
      caption: "c".repeat(1025),
    });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("CAPTION_TOO_LONG");
    expect(mocks.sendVideo).not.toHaveBeenCalled();
  });

  it("passes caption and parse_mode to API", async () => {
    mocks.sendVideo.mockResolvedValue({ message_id: 2, chat: { id: 1 }, date: 0 });
    await call({ video: "https://x.com/v.mp4", caption: "cap", parse_mode: "HTML" });
    const [, , opts] = mocks.sendVideo.mock.calls[0];
    expect(opts.caption).toBe("cap");
    expect(opts.parse_mode).toBe("HTML");
  });

  it("passes duration, width, height to API", async () => {
    mocks.sendVideo.mockResolvedValue({ message_id: 3, chat: { id: 1 }, date: 0 });
    await call({ video: "https://x.com/v.mp4", duration: 30, width: 1920, height: 1080 });
    const [, , opts] = mocks.sendVideo.mock.calls[0];
    expect(opts.duration).toBe(30);
    expect(opts.width).toBe(1920);
    expect(opts.height).toBe(1080);
  });

  it("maps CHAT_NOT_FOUND from GrammyError", async () => {
    const { GrammyError } = await import("grammy");
    mocks.sendVideo.mockRejectedValue(
      new GrammyError("e", { ok: false, error_code: 400, description: "Bad Request: chat not found" }, "sendVideo", {})
    );
    const result = await call({ video: "https://x.com/v.mp4" });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("CHAT_NOT_FOUND");
  });
});
