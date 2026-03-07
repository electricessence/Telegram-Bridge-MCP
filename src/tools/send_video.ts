import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApi, toResult, toError, validateCaption, resolveChat, callApi, resolveMediaSource } from "../telegram.js";
import { resolveParseMode } from "../markdown.js";
import { cancelTyping, showTyping } from "../typing-state.js";
import { clearPendingTemp } from "../temp-message.js";
import { recordBotMessage } from "../session-recording.js";

export function register(server: McpServer) {
  server.registerTool(
    "send_video",
    {
      description: "Sends a video to the Telegram chat. Accepts a local file path, a public HTTPS URL, or a Telegram file_id. Supports optional caption, duration, and dimensions.",
      inputSchema: {
        video: z
        .string()
        .describe("Local absolute file path (e.g. /tmp/clip.mp4), a public HTTPS URL, or a Telegram file_id"),
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
        .describe("Video duration in seconds"),
      width: z
        .number()
        .int()
        .optional()
        .describe("Video width in pixels"),
      height: z
        .number()
        .int()
        .optional()
        .describe("Video height in pixels"),
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
    async ({ video, caption, parse_mode, duration, width, height, disable_notification, reply_to_message_id }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "number") return toError(chatId);

      if (caption) {
        const capErr = validateCaption(caption);
        if (capErr) return toError(capErr);
      }

      const resolved = caption
        ? resolveParseMode(caption, parse_mode)
        : { text: undefined, parse_mode: undefined };

      const videoResult = resolveMediaSource(video);
      if ("code" in videoResult) return toError(videoResult);
      const videoSource = videoResult.source;

      await clearPendingTemp();
      try {
        await showTyping(120, "upload_video");
        const msg = await callApi(() =>
          getApi().sendVideo(chatId, videoSource, {
            caption: resolved.text,
            parse_mode: resolved.parse_mode,
            duration,
            width,
            height,
            disable_notification,
            reply_parameters: reply_to_message_id
              ? { message_id: reply_to_message_id }
              : undefined,
          })
        );
        cancelTyping();
        recordBotMessage({ content_type: "video", caption, message_id: msg.message_id });
        return toResult({
          message_id: msg.message_id,
          file_id: msg.video?.file_id,
          file_name: msg.video?.file_name,
          mime_type: msg.video?.mime_type,
          file_size: msg.video?.file_size,
          width: msg.video?.width,
          height: msg.video?.height,
          duration: msg.video?.duration,
        });
      } catch (err) {
        cancelTyping();
        return toError(err);
      }
    }
  );
}
