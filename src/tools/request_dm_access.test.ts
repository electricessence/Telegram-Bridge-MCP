import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, type ToolHandler } from "./test-utils.js";
import type { ButtonResult } from "./button-helpers.js";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  validateSession: vi.fn(),
  getSession: vi.fn(),
  hasDmPermission: vi.fn(),
  grantDm: vi.fn(),
  pollButtonPress: vi.fn(),
  ackAndEditSelection: vi.fn(),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return {
    ...actual,
    getApi: () => ({
      sendMessage: mocks.sendMessage,
    }),
    resolveChat: () => 42,
  };
});

vi.mock("../session-manager.js", () => ({
  validateSession: (...args: unknown[]) => mocks.validateSession(...args),
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));

vi.mock("../dm-permissions.js", () => ({
  hasDmPermission: (...args: unknown[]) => mocks.hasDmPermission(...args),
  grantDm: (...args: unknown[]) => mocks.grantDm(...args),
}));

vi.mock("./button-helpers.js", async (importActual) => {
  const actual = await importActual<typeof import("./button-helpers.js")>();
  return {
    ...actual,
    pollButtonPress: (...args: unknown[]) => mocks.pollButtonPress(...args),
    ackAndEditSelection: (...args: unknown[]) =>
      mocks.ackAndEditSelection(...args),
  };
});

import { register } from "./request_dm_access.js";

const SENT_MSG = { message_id: 200, chat: { id: 42 }, date: 0 };

function makeButtonResult(data: string): ButtonResult {
  return {
    kind: "button",
    callback_query_id: "cq1",
    data,
    message_id: 200,
  };
}

describe("request_dm_access tool", () => {
  let call: ToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSession.mockReturnValue(true);
    mocks.getSession.mockImplementation((sid: number) => ({
      sid,
      pin: 123456,
      name: sid === 1 ? "alpha" : "beta",
      createdAt: "2026-01-01T00:00:00Z",
    }));
    mocks.hasDmPermission.mockReturnValue(false);
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.ackAndEditSelection.mockResolvedValue(undefined);
    const server = createMockServer();
    register(server);
    call = server.getHandler("request_dm_access");
  });

  it("rejects invalid credentials", async () => {
    mocks.validateSession.mockReturnValue(false);
    const result = await call({ sid: 1, pin: 999999, target_sid: 2 });
    expect(isError(result)).toBe(true);
    expect(parseResult(result).code).toBe("AUTH_FAILED");
  });

  it("rejects self-request", async () => {
    const result = await call({ sid: 1, pin: 123456, target_sid: 1 });
    expect(isError(result)).toBe(true);
    expect(parseResult(result).code).toBe("DM_SELF");
  });

  it("rejects when target does not exist", async () => {
    mocks.getSession.mockImplementation((sid: number) =>
      sid === 1
        ? { sid: 1, pin: 123456, name: "alpha", createdAt: "" }
        : undefined,
    );
    const result = await call({ sid: 1, pin: 123456, target_sid: 99 });
    expect(isError(result)).toBe(true);
    expect(parseResult(result).code).toBe("SESSION_NOT_FOUND");
  });

  it("returns already_granted when permission exists", async () => {
    mocks.hasDmPermission.mockReturnValue(true);
    const result = parseResult(
      await call({ sid: 1, pin: 123456, target_sid: 2 }),
    );
    expect(result.already_granted).toBe(true);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("grants permission when operator approves", async () => {
    mocks.pollButtonPress.mockResolvedValue(
      makeButtonResult("dm_grant"),
    );
    const result = parseResult(
      await call({ sid: 1, pin: 123456, target_sid: 2 }),
    );
    expect(result.granted).toBe(true);
    expect(mocks.grantDm).toHaveBeenCalledWith(1, 2);
    expect(mocks.ackAndEditSelection).toHaveBeenCalled();
  });

  it("denies permission when operator rejects", async () => {
    mocks.pollButtonPress.mockResolvedValue(
      makeButtonResult("dm_deny"),
    );
    const result = parseResult(
      await call({ sid: 1, pin: 123456, target_sid: 2 }),
    );
    expect(result.granted).toBe(false);
    expect(mocks.grantDm).not.toHaveBeenCalled();
  });

  it("returns timed_out when operator does not respond", async () => {
    mocks.pollButtonPress.mockResolvedValue(null);
    const result = parseResult(
      await call({ sid: 1, pin: 123456, target_sid: 2 }),
    );
    expect(result.timed_out).toBe(true);
    expect(mocks.grantDm).not.toHaveBeenCalled();
  });

  it("sends prompt with session names", async () => {
    mocks.pollButtonPress.mockResolvedValue(
      makeButtonResult("dm_grant"),
    );
    await call({ sid: 1, pin: 123456, target_sid: 2 });
    const text = mocks.sendMessage.mock.calls[0][1] as string;
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
  });
});
