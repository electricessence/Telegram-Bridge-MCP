import { vi, describe, it, expect, beforeEach } from "vitest";
import type { TelegramError } from "../telegram.js";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  sendChatAction: vi.fn(),
  resolveChat: vi.fn((): number | TelegramError => 123),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, getApi: () => mocks, resolveChat: mocks.resolveChat };
});

import { register } from "./send_chat_action.js";

describe("send_chat_action tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("send_chat_action");
  });

  it("sends typing action by default and returns ok:true", async () => {
    mocks.sendChatAction.mockResolvedValue(undefined);
    const result = await call({ action: "typing" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.ok).toBe(true);
    expect(mocks.sendChatAction).toHaveBeenCalledWith(123, "typing");
  });

  it("sends record_voice action", async () => {
    mocks.sendChatAction.mockResolvedValue(undefined);
    await call({ action: "record_voice" });
    expect(mocks.sendChatAction).toHaveBeenCalledWith(123, "record_voice");
  });

  it("sends upload_document action", async () => {
    mocks.sendChatAction.mockResolvedValue(undefined);
    await call({ action: "upload_document" });
    expect(mocks.sendChatAction).toHaveBeenCalledWith(123, "upload_document");
  });

  it("returns error when resolveChat returns non-number", async () => {
    mocks.resolveChat.mockReturnValueOnce({ code: "UNAUTHORIZED_CHAT", message: "test" });
    const result = await call({ action: "typing" });
    expect(isError(result)).toBe(true);
  });

  it("returns error when sendChatAction throws", async () => {
    mocks.sendChatAction.mockRejectedValue(new Error("API error"));
    const result = await call({ action: "typing" });
    expect(isError(result)).toBe(true);
  });
});
