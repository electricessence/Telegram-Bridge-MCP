import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getApi, toResult, toError, resolveChat } from "../telegram.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_chat",
    {
      description: "Returns information about the configured chat: id, type, title, username, first/last name, and description.",
    },
    async () => {
      const chatId = resolveChat();
      if (typeof chatId !== "string") return toError(chatId);
      try {
        const chat = await getApi().getChat(chatId);
        const c = chat as unknown as Record<string, unknown>;
        return toResult({
          id: chat.id,
          type: chat.type,
          title: c.title,
          username: c.username,
          first_name: c.first_name,
          last_name: c.last_name,
          description: c.description,
        });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
