import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { transcribeWithIndicator } from "../transcribe.js";

export function register(server: McpServer) {
  server.registerTool(
    "transcribe_voice",
    {
      description: "Transcribes a Telegram voice message by its file_id. Use this when you have a voice message's file_id (returned in wait_for_message or get_updates voice results) but need to (re-)transcribe it — for example if the update was already consumed before transcription was read, or if transcription failed previously.",
      inputSchema: {
        file_id: z
        .string()
        .describe("The Telegram file_id of the voice message to transcribe"),
      message_id: z
        .number()
        .int()
        .optional()
        .describe("Optional message_id — if provided, adds a ✍ / 🫡 reaction to indicate transcription progress"),
      },
    },
    async ({ file_id, message_id }) => {
      try {
        const text = await transcribeWithIndicator(file_id, message_id);
        return toResult({ text });
      } catch (err) {
        return toError(err);
      }
    },
  );
}
