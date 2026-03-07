import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError, errorCode } from "./test-utils.js";

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return { ...actual, resolveChat: () => 49154463 };
});

import { register } from "./send_message_draft.js";

// Mock global fetch after import
const mockFetch = vi.fn();

function okResponse() {
  return Promise.resolve({
    json: () => Promise.resolve({ ok: true }),
  } as Response);
}

function errResponse(description: string) {
  return Promise.resolve({
    json: () => Promise.resolve({ ok: false, error_code: 400, description }),
  } as Response);
}

describe("send_message_draft tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("BOT_TOKEN", "test-token");
    mockFetch.mockImplementation(okResponse);
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("send_message_draft");
  });

  it("returns ok + draft_id on success", async () => {
    const result = await call({ draft_id: 1, text: "Hello world" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.ok).toBe(true);
    expect(data.draft_id).toBe(1);
  });

  it("calls sendMessageDraft endpoint with correct URL", async () => {
    await call({ draft_id: 1, text: "Hello" });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sendMessageDraft");
  });

  it("omits parse_mode when not specified (plain text default)", async () => {
    await call({ draft_id: 1, text: "Hello world" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parse_mode).toBeUndefined();
  });

  it("auto-converts Markdown parse_mode to MarkdownV2", async () => {
    await call({ draft_id: 1, text: "Hello world", parse_mode: "Markdown" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parse_mode).toBe("MarkdownV2");
  });

  it("passes HTML parse_mode directly", async () => {
    await call({ draft_id: 2, text: "Hello", parse_mode: "HTML" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.parse_mode).toBe("HTML");
    expect(body.draft_id).toBe(2);
  });

  it("passes message_thread_id when provided", async () => {
    await call({ draft_id: 1, text: "Hi", message_thread_id: 999 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.message_thread_id).toBe(999);
  });

  it("returns EMPTY_MESSAGE error for blank text", async () => {
    const result = await call({ draft_id: 1, text: "   " });
    expect(isError(result)).toBe(true);
    expect(errorCode(result)).toBe("EMPTY_MESSAGE");
  });

  it("returns error when API returns not ok", async () => {
    mockFetch.mockImplementation(() => errResponse("Bad Request: chat not found"));
    const result = await call({ draft_id: 1, text: "Hello" });
    expect(isError(result)).toBe(true);
  });

  it("sends chat_id as integer", async () => {
    await call({ draft_id: 5, text: "Test" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.chat_id).toBe(49154463);
  });
});
