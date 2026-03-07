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
    "send_document",
    {
      description: "Sends a file (document) to the Telegram chat. Accepts a local file path, a public HTTPS URL, or a Telegram file_id. Use this to send PDFs, Excel files, ZIPs, text files, or any other file type. For photos/images, use send_photo instead.",
      inputSchema: {
        document: z
        .string()
        .describe(
          "Local absolute file path (e.g. /tmp/report.xlsx), a public HTTPS URL, or a Telegram file_id"
        ),
      caption: z
        .string()
        .optional()
        .describe("Optional caption (up to 1024 chars)"),
      parse_mode: z
        .enum(["Markdown", "HTML", "MarkdownV2"])
        .default("Markdown")
        .describe(
          "Markdown = standard Markdown auto-converted (default); MarkdownV2 = raw; HTML = HTML tags"
        ),
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
    async ({ document, caption, parse_mode, disable_notification, reply_to_message_id }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "string") return toError(chatId);

      if (caption) {
        const capErr = validateCaption(caption);
        if (capErr) return toError(capErr);
      }

      const resolved = caption
        ? resolveParseMode(caption, parse_mode)
        : { text: undefined, parse_mode: undefined };

      // Resolve the document source: local path, URL, or file_id
      let docSource: string | InputFile;
      if (document.startsWith("http://")) {
        return toError({ code: "UNKNOWN" as const, message: "Plain HTTP URLs are not accepted — use HTTPS to prevent interception in transit." });
      } else if (document.startsWith("https://")) {
        // URL — pass directly
        docSource = document;
      } else if (existsSync(document)) {
        // Local file path — must be under SAFE_FILE_DIR
        const resolvedPath = resolve(document);
        const rel = relative(SAFE_FILE_DIR, resolvedPath);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          return toError({ code: "UNKNOWN" as const, message: `Local file access is restricted to ${SAFE_FILE_DIR}. Use download_file to stage files first.` });
        }
        docSource = new InputFile(resolvedPath);
      } else {
        // Assume Telegram file_id
        docSource = document;
      }

      await clearPendingTemp();
      try {
        await showTyping(60, "upload_document");
        const msg = await callApi(() => getApi().sendDocument(chatId, docSource, {
          caption: resolved.text,
          parse_mode: resolved.parse_mode,
          disable_notification,
          reply_parameters: reply_to_message_id
            ? { message_id: reply_to_message_id }
            : undefined,
        }));
        cancelTyping();
        recordBotMessage({ content_type: "document", caption, message_id: msg.message_id });
        return toResult({
          message_id: msg.message_id,
          file_id: msg.document?.file_id,
          file_name: msg.document?.file_name,
          mime_type: msg.document?.mime_type,
          file_size: msg.document?.file_size,
        });
      } catch (err) {
        cancelTyping();
        return toError(err);
      }
    }
  );
}
