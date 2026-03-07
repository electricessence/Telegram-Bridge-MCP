import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError, validateCaption, resolveChat, sendVoiceDirect } from "../telegram.js";
import { resolveParseMode } from "../markdown.js";
import { cancelTyping, showTyping } from "../typing-state.js";
import { clearPendingTemp } from "../temp-message.js";
import { recordBotMessage } from "../session-recording.js";

export function register(server: McpServer) {
  server.registerTool(
    "send_voice",
    {
      description: "Sends an existing audio file as a voice note — use this when you already have an OGG/Opus file (local path, public URL, or Telegram file_id). To synthesize and speak text as a voice note, use send_message with voice:true instead.",
      inputSchema: {
        voice: z
        .string()
        .describe("Local absolute file path (e.g. /tmp/voice.ogg), a public HTTPS URL, or a Telegram file_id"),
      caption: z
        .string()
        .optional()
        .describe("Optional caption (up to 1024 chars)"),
      parse_mode: z
        .enum(["Markdown", "HTML", "MarkdownV2"])
        .default("Markdown")
        .describe("Markdown = standard Markdown auto-converted (default); MarkdownV2 = raw; HTML = HTML tags"),
      duration: z
        .number()
        .int()
        .optional()
        .describe("Voice note duration in seconds"),
      disable_notification: z
        .boolean()
        .optional()
        .describe("Send silently"),
      reply_to_message_id: z
        .number()
        .int()
        .optional()
        .describe("Reply to this message ID"),
      },
    },
    async ({ voice, caption, parse_mode, duration, disable_notification, reply_to_message_id }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "number") return toError(chatId);

      if (caption) {
        const capErr = validateCaption(caption);
        if (capErr) return toError(capErr);
      }

      const resolved = caption
        ? resolveParseMode(caption, parse_mode)
        : { text: undefined, parse_mode: undefined };

      await clearPendingTemp();
      try {
        await showTyping(30, "upload_voice");
        const msg = await sendVoiceDirect(chatId, voice, {
          caption: resolved.text,
          parse_mode: resolved.parse_mode,
          duration,
          disable_notification,
          reply_to_message_id,
        });
        cancelTyping();
        recordBotMessage({ content_type: "voice", caption, message_id: msg.message_id });
        return toResult({
          message_id: msg.message_id,
          file_id: (msg.voice as any)?.file_id,
          mime_type: (msg.voice as any)?.mime_type,
          file_size: (msg.voice as any)?.file_size,
          duration: (msg.voice as any)?.duration,
        });
      } catch (err) {
        cancelTyping();
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("user restricted receiving of voice note messages")) {
          return toError({
            code: "VOICE_RESTRICTED",
            message:
              "Telegram blocked voice delivery — the user's privacy settings restrict voice notes from bots. " +
              "To fix: Telegram → Settings → Privacy and Security → Voice Messages → " +
              "Add Exceptions → Always Allow → add this bot. " +
              "The base setting can remain as-is; the 'Always Allow' exception is sufficient.",
          } as const);
        }
        return toError(err);
      }
    }
  );
}
