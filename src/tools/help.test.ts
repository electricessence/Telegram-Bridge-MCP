import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";

const MOCK_GUIDE = "# Behavior Guide\n\nThis is the mock guide content.";

vi.mock("fs", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    readFileSync: (path: unknown, _encoding?: unknown) => {
      const p = String(path);
      if (p.includes("behavior.md")) return MOCK_GUIDE;
      // Fall through to actual for anything else
      return (actual.readFileSync as (...a: unknown[]) => unknown)(path, _encoding);
    },
  };
});

import { register } from "./help.js";

describe("help tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server);
    call = server.getHandler("help");
  });

  it("help() with no topic returns an overview containing tool names", async () => {
    const result = await call({});
    expect(isError(result)).toBe(false);
    const { content } = parseResult<{ content: string }>(result);
    expect(content).toContain("notify");
    expect(content).toContain("session_start");
    expect(content).toContain("dequeue_update");
    expect(content).toContain("help");
    expect(content).toContain("Tool Index");
  });

  it("help(topic: 'guide') returns the communication guide content", async () => {
    const result = await call({ topic: "guide" });
    expect(isError(result)).toBe(false);
    const { content } = parseResult<{ content: string }>(result);
    expect(content).toContain("# Agent Communication Guide");
    expect(content).toContain(MOCK_GUIDE);
  });

  it("help(topic: 'notify') returns the notify tool description", async () => {
    const result = await call({ topic: "notify" });
    expect(isError(result)).toBe(false);
    const { content } = parseResult<{ content: string }>(result);
    expect(content).toContain("notify");
    expect(content).toContain("notification");
  });

  it("help(topic: 'unknown_tool') returns isError: true with UNKNOWN code", async () => {
    const result = await call({ topic: "unknown_tool" });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("UNKNOWN");
    const parsed = parseResult<{ message: string }>(result);
    expect(parsed.message).toContain("Unknown topic: 'unknown_tool'");
    expect(parsed.message).toContain("help()");
  });
});
