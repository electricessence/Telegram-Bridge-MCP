import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  getTopic: vi.fn<() => string | null>(),
  setTopic: vi.fn(),
  clearTopic: vi.fn(),
}));

vi.mock("../topic-state.js", () => ({
  getTopic: mocks.getTopic,
  setTopic: mocks.setTopic,
  clearTopic: mocks.clearTopic,
}));

import { register } from "./set_topic.js";

describe("set_topic tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTopic.mockReturnValue(null);
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("set_topic");
  });

  it("sets a topic and returns { topic, previous, set: true }", async () => {
    mocks.getTopic.mockReturnValueOnce(null).mockReturnValueOnce("Refactor Agent");
    const result = await call({ topic: "Refactor Agent" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.set).toBe(true);
    expect(data.topic).toBe("Refactor Agent");
    expect(data.previous).toBeNull();
    expect(mocks.setTopic).toHaveBeenCalledWith("Refactor Agent");
  });

  it("replaces an existing topic", async () => {
    mocks.getTopic.mockReturnValueOnce("Old Topic").mockReturnValueOnce("New Topic");
    const result = await call({ topic: "New Topic" });
    const data = parseResult(result) as any;
    expect(data.previous).toBe("Old Topic");
    expect(data.topic).toBe("New Topic");
  });

  it("clears topic when empty string passed", async () => {
    mocks.getTopic.mockReturnValueOnce("Refactor Agent");
    const result = await call({ topic: "" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.cleared).toBe(true);
    expect(data.topic).toBeNull();
    expect(data.previous).toBe("Refactor Agent");
    expect(mocks.clearTopic).toHaveBeenCalledOnce();
    expect(mocks.setTopic).not.toHaveBeenCalled();
  });

  it("clears topic when whitespace-only string passed", async () => {
    mocks.getTopic.mockReturnValueOnce("Test Runner");
    const result = await call({ topic: "   " });
    const data = parseResult(result) as any;
    expect(data.cleared).toBe(true);
    expect(mocks.clearTopic).toHaveBeenCalledOnce();
  });
});
