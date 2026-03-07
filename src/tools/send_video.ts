import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InputFile } from "grammy";
import { existsSync } from "fs";
import { resolve, relative, isAbsolute } from "path";
import { z } from "zod";
import { getApi, toResult, toError, validateCaption, resolveChat, callApi, SAFE_FILE_DIR } from "../telegram.js";
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
      if (typeof chatId !== "string") return toError(chatId);

      if (caption) {
        const capErr = validateCaption(caption);
        if (capErr) return toError(capErr);
      }

      const resolved = caption
        ? resolveParseMode(caption, parse_mode)
        : { text: undefined, parse_mode: undefined };

      let videoSource: string | InputFile;
      if (video.startsWith("http://")) {
        return toError({ code: "UNKNOWN" as const, message: "Plain HTTP URLs are not accepted — use HTTPS to prevent interception in transit." });
      } else if (video.startsWith("https://")) {
        videoSource = video;
      } else if (existsSync(video)) {
        // Local file path — must be under SAFE_FILE_DIR
        const resolvedPath = resolve(video);
        const rel = relative(SAFE_FILE_DIR, resolvedPath);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          return toError({ code: "UNKNOWN" as const, message: `Local file access is restricted to ${SAFE_FILE_DIR}. Use download_file to stage files first.` });
        }
        videoSource = new InputFile(resolvedPath);
      } else {
        videoSource = video; // Assume Telegram file_id
      }

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
