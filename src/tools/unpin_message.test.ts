import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";

const mocks = vi.hoisted(() => ({ unpinChatMessage: vi.fn() }));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, getApi: () => mocks, resolveChat: () => 1 };
});

import { register } from "./unpin_message.js";

describe("unpin_message tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("unpin_message");
  });

  it("returns ok: true on success", async () => {
    mocks.unpinChatMessage.mockResolvedValue(true);
    const result = await call({ message_id: 5 });
    expect(isError(result)).toBe(false);
    expect((parseResult(result) as any).ok).toBe(true);
  });

  it("passes message_id to the API", async () => {
    mocks.unpinChatMessage.mockResolvedValue(true);
    await call({ message_id: 42 });
    expect(mocks.unpinChatMessage.mock.calls[0][1]).toBe(42);
  });

  it("omits message_id when not provided (unpins most recent)", async () => {
    mocks.unpinChatMessage.mockResolvedValue(true);
    await call({});
    expect(mocks.unpinChatMessage.mock.calls[0][1]).toBeUndefined();
  });

  it("returns NOT_ENOUGH_RIGHTS when bot lacks admin", async () => {
    const { GrammyError } = await import("grammy");
    mocks.unpinChatMessage.mockRejectedValue(
      new GrammyError("e", { ok: false, error_code: 400, description: "Bad Request: not enough rights" }, "unpinChatMessage", {})
    );
    const result = await call({ message_id: 5 });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("NOT_ENOUGH_RIGHTS");
  });
});
