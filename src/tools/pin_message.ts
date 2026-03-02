import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApi, toResult, toError, resolveChat } from "../telegram.js";

export function register(server: McpServer) {
  server.registerTool(
    "pin_message",
    {
      description: "Pins a message in a chat. Requires the bot to have appropriate admin rights.",
      inputSchema: {
        message_id: z.number().int().describe("ID of the message to pin"),
      disable_notification: z
        .boolean()
        .optional()
        .describe("Pin without notifying members"),
      },
    },
    async ({ message_id, disable_notification }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "string") return toError(chatId);
      try {
        const ok = await getApi().pinChatMessage(chatId, message_id, {
          disable_notification,
        });
        return toResult({ ok });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
