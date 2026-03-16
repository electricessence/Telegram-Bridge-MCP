import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, type ToolHandler } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  closeSession: vi.fn(),
  validateSession: vi.fn(),
}));

vi.mock("../session-manager.js", () => ({
  closeSession: (...args: unknown[]) => mocks.closeSession(...args),
  validateSession: (...args: unknown[]) => mocks.validateSession(...args),
}));

import { register } from "./close_session.js";

describe("close_session tool", () => {
  let call: ToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockReturnValue(true);
    mocks.closeSession.mockReturnValue(true);
    const server = createMockServer();
    register(server);
    call = server.getHandler("close_session");
  });

  it("rejects invalid credentials", async () => {
    mocks.validateSession.mockReturnValue(false);

    const result = await call({ sid: 1, pin: 999999 });

    expect(isError(result)).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.code).toBe("AUTH_FAILED");
  });

  it("closes an existing session", async () => {
    const result = parseResult(await call({ sid: 1, pin: 123456 }));

    expect(mocks.closeSession).toHaveBeenCalledWith(1);
    expect(result.closed).toBe(true);
    expect(result.sid).toBe(1);
  });

  it("returns not_found for nonexistent session", async () => {
    mocks.closeSession.mockReturnValue(false);

    const result = parseResult(await call({ sid: 99, pin: 123456 }));

    expect(result.closed).toBe(false);
    expect(result.sid).toBe(99);
  });

  it("validates credentials before closing", async () => {
    await call({ sid: 2, pin: 654321 });

    expect(mocks.validateSession).toHaveBeenCalledWith(2, 654321);
    // validateSession is called before closeSession
    const validateOrder = mocks.validateSession.mock.invocationCallOrder[0];
    const closeOrder = mocks.closeSession.mock.invocationCallOrder[0];
    expect(validateOrder).toBeLessThan(closeOrder);
  });

  it("does not call closeSession when auth fails", async () => {
    mocks.validateSession.mockReturnValue(false);

    await call({ sid: 1, pin: 999999 });

    expect(mocks.closeSession).not.toHaveBeenCalled();
  });
});
