import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";
import { GrammyError } from "grammy";

const mocks = vi.hoisted(() => ({ setMyCommands: vi.fn() }));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, getApi: () => mocks, resolveChat: () => 42 };
});

import { register } from "./set_commands.js";

const SAMPLE_COMMANDS = [
  { command: "cancel", description: "Stop the current task" },
  { command: "exit", description: "Exit the current workflow" },
];

describe("set_commands tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("set_commands");
    mocks.setMyCommands.mockResolvedValue(true);
  });

  it("registers commands scoped to active chat (default scope)", async () => {
    const result = await call({ commands: SAMPLE_COMMANDS });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.ok).toBe(true);
    expect(data.count).toBe(2);
    expect(data.scope).toBe("chat");
    expect(data.cleared).toBe(false);
    expect(mocks.setMyCommands).toHaveBeenCalledWith(SAMPLE_COMMANDS, {
      scope: { type: "chat", chat_id: 42 },
    });
  });

  it("registers commands with explicit chat scope", async () => {
    const result = await call({ commands: SAMPLE_COMMANDS, scope: "chat" });
    expect(isError(result)).toBe(false);
    expect(mocks.setMyCommands).toHaveBeenCalledWith(SAMPLE_COMMANDS, {
      scope: { type: "chat", chat_id: 42 },
    });
  });

  it("registers commands with default (global) scope", async () => {
    const result = await call({ commands: SAMPLE_COMMANDS, scope: "default" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.scope).toBe("default");
    expect(mocks.setMyCommands).toHaveBeenCalledWith(SAMPLE_COMMANDS, {
      scope: { type: "default" },
    });
  });

  it("clears commands when empty array passed", async () => {
    const result = await call({ commands: [] });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.ok).toBe(true);
    expect(data.count).toBe(0);
    expect(data.cleared).toBe(true);
    expect(data.commands).toBeNull();
    expect(mocks.setMyCommands).toHaveBeenCalledWith([], {
      scope: { type: "chat", chat_id: 42 },
    });
  });

  it("rejects a command with uppercase letters", () => {
    expect(() =>
      call({ commands: [{ command: "Cancel", description: "Stop" }] })
    ).toThrow();
    expect(mocks.setMyCommands).not.toHaveBeenCalled();
  });

  it("rejects a command with a leading slash", () => {
    expect(() =>
      call({ commands: [{ command: "/cancel", description: "Stop" }] })
    ).toThrow();
  });

  it("rejects a command with spaces", () => {
    expect(() =>
      call({ commands: [{ command: "my command", description: "Stop" }] })
    ).toThrow();
  });

  it("maps API errors to TelegramError", async () => {
    mocks.setMyCommands.mockRejectedValue(
      new GrammyError(
        "e",
        { ok: false, error_code: 400, description: "Bad Request: chat not found" },
        "setMyCommands",
        {},
      )
    );
    const result = await call({ commands: SAMPLE_COMMANDS });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("CHAT_NOT_FOUND");
  });
});
