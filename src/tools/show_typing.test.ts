import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  showTyping: vi.fn(),
  cancelTyping: vi.fn(),
  resolveChat: vi.fn(() => 99),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, resolveChat: mocks.resolveChat };
});

vi.mock("../typing-state.js", () => ({
  showTyping: mocks.showTyping,
  cancelTyping: mocks.cancelTyping,
}));

import { register } from "./show_typing.js";

describe("show_typing tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server);
    call = server.getHandler("show_typing");
  });

  it("returns ok:true with default timeout of 20", async () => {
    mocks.showTyping.mockResolvedValue(true);
    const result = await call({});
    expect(isError(result)).toBe(false);
    const data = parseResult(result);
    expect(data.ok).toBe(true);
    expect(data.timeout_seconds).toBe(20);
    expect(mocks.showTyping).toHaveBeenCalledWith(20);
  });

  it("passes provided timeout to showTyping", async () => {
    mocks.showTyping.mockResolvedValue(true);
    const result = await call({ timeout_seconds: 60 });
    expect(isError(result)).toBe(false);
    const data = parseResult(result);
    expect(data.timeout_seconds).toBe(60);
    expect(mocks.showTyping).toHaveBeenCalledWith(60);
  });

  it("returns started:true when newly started", async () => {
    mocks.showTyping.mockResolvedValue(true);
    const result = await call({ timeout_seconds: 30 });
    const data = parseResult(result);
    expect(data.started).toBe(true);
  });

  it("returns started:false when extending an existing indicator", async () => {
    mocks.showTyping.mockResolvedValue(false);
    const result = await call({ timeout_seconds: 30 });
    const data = parseResult(result);
    expect(data.started).toBe(false);
  });

  it("cancels the indicator when cancel:true and returns cancelled:true if was active", async () => {
    mocks.cancelTyping.mockReturnValue(true);
    const result = await call({ cancel: true });
    expect(isError(result)).toBe(false);
    const data = parseResult(result);
    expect(data.ok).toBe(true);
    expect(data.cancelled).toBe(true);
    expect(mocks.showTyping).not.toHaveBeenCalled();
  });

  it("returns cancelled:false when cancel:true but indicator was not active", async () => {
    mocks.cancelTyping.mockReturnValue(false);
    const result = await call({ cancel: true });
    const data = parseResult(result);
    expect(data.cancelled).toBe(false);
  });

  it("returns error when chat is not configured", async () => {
    mocks.resolveChat.mockReturnValueOnce({ code: "UNAUTHORIZED_CHAT", message: "no chat" });
    const result = await call({});
    expect(isError(result)).toBe(true);
  });
});
