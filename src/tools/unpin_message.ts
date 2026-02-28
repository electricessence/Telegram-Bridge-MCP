import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApi, toResult, toError, resolveChat } from "../telegram.js";

export function register(server: McpServer) {
  server.tool(
    "unpin_message",
    "Unpins a message in the chat. If message_id is omitted, unpins the most recently pinned message. Requires the bot to have appropriate admin rights.",
    {
      message_id: z
        .number()
        .int()
        .optional()
        .describe("ID of the message to unpin. Omit to unpin the most recently pinned message."),
    },
    async ({ message_id }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "string") return toError(chatId);
      try {
        const ok = await getApi().unpinChatMessage(chatId, message_id);
        return toResult({ ok });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
