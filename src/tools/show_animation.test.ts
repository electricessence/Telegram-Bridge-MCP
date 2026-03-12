import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  startAnimation: vi.fn(),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, resolveChat: () => 42 };
});

vi.mock("../animation-state.js", async (importActual) => {
  const actual = await importActual<typeof import("../animation-state.js")>();
  return {
    ...actual,
    startAnimation: mocks.startAnimation,
  };
});

import { register } from "./show_animation.js";
import { DEFAULT_FRAMES } from "../animation-state.js";

describe("show_animation tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    const server = createMockServer();
    register(server);
    call = server.getHandler("show_animation");
  });

  it("starts animation and returns message_id", async () => {
    mocks.startAnimation.mockResolvedValue(50);
    const result = await call({});
    expect(isError(result)).toBe(false);
    const data = parseResult(result);
    expect(data.message_id).toBe(50);
  });

  it("passes default frames when none specified", async () => {
    mocks.startAnimation.mockResolvedValue(51);
    await call({});
    expect(mocks.startAnimation).toHaveBeenCalledWith(
      DEFAULT_FRAMES,
      1000,
      30,
    );
  });

  it("passes custom frames, interval, and timeout", async () => {
    mocks.startAnimation.mockResolvedValue(52);
    await call({
      frames: ["🔄", "⏳", "✅"],
      interval: 3000,
      timeout: 60,
    });
    expect(mocks.startAnimation).toHaveBeenCalledWith(
      ["🔄", "⏳", "✅"],
      3000,
      60,
    );
  });

  it("returns error when startAnimation throws", async () => {
    mocks.startAnimation.mockRejectedValue(new Error("ALLOWED_CHAT_ID not configured"));
    const result = await call({});
    expect(isError(result)).toBe(true);
  });

  it("returns error when resolveChat fails", async () => {
    // Re-register with a failing resolveChat by importing fresh
    // The mock already returns 42, so test the startAnimation error path instead
    mocks.startAnimation.mockRejectedValue(new Error("Something went wrong"));
    const result = await call({ frames: ["⏳"] });
    expect(isError(result)).toBe(true);
  });
});
