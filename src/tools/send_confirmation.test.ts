import { vi, describe, it, expect, beforeEach } from "vitest";
import { createMockServer, parseResult, isError } from "./test-utils.js";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  getUpdates: vi.fn(),
  answerCallbackQuery: vi.fn(),
  editMessageText: vi.fn(),
}));

vi.mock("../telegram.js", async (importActual) => {
  const actual = await importActual<typeof import("../telegram.js")>();
  return {
    ...actual,
    getApi: () => mocks,
    getOffset: () => 0,
    advanceOffset: vi.fn(),
    resolveChat: () => 42,
    pollUntil: async (matcher: any, _timeout: number) => {
      const updates = await mocks.getUpdates();
      const result = matcher(updates);
      const missed = result !== undefined
        ? updates.filter((u: any) => matcher([u]) === undefined)
        : [...updates];
      return { match: result, missed };
    },
  };
});

import { register } from "./send_confirmation.js";

const SENT_MSG = { message_id: 5, chat: { id: 42 }, date: 0 };

const makeCallbackUpdate = (data: string) => ({
  update_id: 1,
  callback_query: {
    id: "cq1",
    data,
    from: { id: 1, first_name: "Alice", username: "alice" },
    message: { message_id: 5, chat: { id: 42 } },
  },
});

describe("send_confirmation tool", () => {
  let call: (args: Record<string, unknown>) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.answerCallbackQuery.mockResolvedValue(true);
    mocks.editMessageText.mockResolvedValue(true);
    const server = createMockServer();
    register(server as any);
    call = server.getHandler("send_confirmation");
  });

  it("returns confirmed:true when Yes is pressed", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_yes")]);
    const result = await call({ text: "Proceed?" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.timed_out).toBe(false);
    expect(data.confirmed).toBe(true);
    expect(data.value).toBe("confirm_yes");
    expect(data.message_id).toBe(5);
  });

  it("returns confirmed:false when No is pressed", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_no")]);
    const result = await call({ text: "Delete everything?" });
    expect(isError(result)).toBe(false);
    const data = parseResult(result) as any;
    expect(data.confirmed).toBe(false);
    expect(data.value).toBe("confirm_no");
  });

  it("answers the callback_query automatically", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_yes")]);
    await call({ text: "Proceed?" });
    expect(mocks.answerCallbackQuery).toHaveBeenCalledWith("cq1");
  });

  it("edits message to show chosen label with ▸ and removes buttons", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_yes")]);
    await call({ text: "Proceed?" });
    expect(mocks.editMessageText).toHaveBeenCalledWith(
      42,
      5,
      expect.stringContaining("▸"),
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
    );
  });

  it("shows the No label in the edit when No is pressed", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_no")]);
    await call({ text: "Proceed?", yes_text: "✔️ Yes", no_text: "✖️ No" });
    const [, , editedText] = mocks.editMessageText.mock.calls[0];
    expect(editedText).toContain("✖️ No");
    expect(editedText).not.toContain("✔️ Yes");
  });

  it("respects custom yes_data and no_data", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("approve")]);
    const result = await call({ text: "Approve?", yes_data: "approve", no_data: "reject" });
    const data = parseResult(result) as any;
    expect(data.confirmed).toBe(true);
    expect(data.value).toBe("approve");
  });

  it("returns timed_out:true when no button is pressed", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([]);
    const result = await call({ text: "Proceed?" });
    const data = parseResult(result) as any;
    expect(data.timed_out).toBe(true);
    expect(mocks.answerCallbackQuery).not.toHaveBeenCalled();
    expect(mocks.editMessageText).toHaveBeenCalledWith(
      42,
      5,
      expect.stringContaining("Timed out"),
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
    );
  });

  it("ignores callbacks from a different message_id", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([{
      update_id: 1,
      callback_query: {
        id: "cq2",
        data: "confirm_yes",
        from: { id: 1, first_name: "Alice" },
        message: { message_id: 999, chat: { id: 42 } }, // different message
      },
    }]);
    const result = await call({ text: "Proceed?" });
    const data = parseResult(result) as any;
    expect(data.timed_out).toBe(true);
    expect(mocks.editMessageText).toHaveBeenCalledWith(
      42,
      5,
      expect.stringContaining("Timed out"),
      expect.objectContaining({ reply_markup: { inline_keyboard: [] } }),
    );
  });

  it("returns error when sendMessage throws", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Network error"));
    const result = await call({ text: "Proceed?" });
    expect(isError(result)).toBe(true);
  });

  it("sends with a reply_to_message_id when provided", async () => {
    mocks.sendMessage.mockResolvedValue(SENT_MSG);
    mocks.getUpdates.mockResolvedValue([makeCallbackUpdate("confirm_yes")]);
    await call({ text: "Proceed?", reply_to_message_id: 3 });
    const sendOpts = mocks.sendMessage.mock.calls[0][2];
    expect(sendOpts.reply_parameters).toEqual({ message_id: 3 });
  });
});
