import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toError } from "../telegram.js";
import {
  getRecordedUpdates,
  isRecording,
  recordedCount,
  getMaxUpdates,
  clearRecording,
  stopRecording,
} from "../session-recording.js";
import { sanitizeUpdates } from "../update-sanitizer.js";

function formatLog(
  updates: Record<string, unknown>[],
  recording: boolean,
  total: number,
  maxUpdates: number
): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("# Session Recording Log");
  lines.push(`Generated: ${now}`);
  lines.push(`Recording: ${recording ? "active" : "inactive"}`);
  lines.push(`Updates: ${total} / ${maxUpdates}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (updates.length === 0) {
    lines.push("(no updates captured)");
  } else {
    updates.forEach((u, i) => {
      const idx = i + 1;
      const type = String(u.type ?? "unknown");

      if (type === "message") {
        const contentType = String(u.content_type ?? "unknown");
        const msgId = u.message_id != null ? `msg_id: ${u.message_id}` : "";
        const replyTo = u.reply_to_message_id != null ? ` (reply to: ${u.reply_to_message_id})` : "";
        lines.push(`[${idx}] message · ${contentType} | ${msgId}${replyTo}`);

        if (u.text)  lines.push(String(u.text));
        if (u.caption) lines.push(`Caption: ${u.caption}`);
        if (u.file_name) lines.push(`File: ${u.file_name}`);
        if (u.file_id && !u.text) lines.push(`file_id: ${u.file_id}`);
        if (u.emoji) lines.push(`Emoji: ${u.emoji}`);
        if (u.question) lines.push(`Poll: ${u.question}`);
        if (Array.isArray(u.content_keys) && u.content_keys.length)
          lines.push(`[unknown content, keys: ${(u.content_keys as string[]).join(", ")}]`);
      } else if (type === "callback_query") {
        const msgId = u.message_id != null ? `msg_id: ${u.message_id}` : "";
        lines.push(`[${idx}] callback_query | ${msgId}`);
        if (u.data) lines.push(`data: ${u.data}`);
      } else if (type === "message_reaction") {
        const msgId = u.message_id != null ? `msg_id: ${u.message_id}` : "";
        lines.push(`[${idx}] message_reaction | ${msgId}`);
        const added = Array.isArray(u.emoji_added) && u.emoji_added.length
          ? u.emoji_added.join(" ") : "(none)";
        const removed = Array.isArray(u.emoji_removed) && u.emoji_removed.length
          ? u.emoji_removed.join(" ") : "(none)";
        lines.push(`Added: ${added}  Removed: ${removed}`);
      } else {
        lines.push(`[${idx}] ${type}`);
      }

      lines.push("");
    });
  }

  lines.push("---");
  lines.push("End of log");
  return lines.join("\n");
}

export function register(server: McpServer) {
  server.registerTool(
    "dump_session_record",
    {
      description:
        "Formats all recorded session updates as a human-readable log string and returns the content " +
        "directly to the caller (no file is written). " +
        "clean=true clears the buffer after dumping (recording stays active). " +
        "stop=true stops recording and clears the buffer after dumping (implies clean).",
      inputSchema: {
        clean: z
          .boolean()
          .optional()
          .describe(
            "If true, clear the recording buffer after a successful dump while keeping recording active."
          ),
        stop: z
          .boolean()
          .optional()
          .describe(
            "If true, stop recording and clear the buffer after a successful dump. Implies clean."
          ),
      },
    },
    async ({ clean, stop }) => {
      try {
        const all = getRecordedUpdates(); // oldest → newest
        const sanitized = await sanitizeUpdates(all);
        const recording = isRecording();
        const total = recordedCount();
        const maxUpdates = getMaxUpdates();

        const log = formatLog(sanitized, recording, total, maxUpdates);

        if (stop) {
          stopRecording();
          clearRecording();
        } else if (clean) {
          clearRecording();
        }

        return {
          content: [{ type: "text" as const, text: log }],
        };
      } catch (err) {
        return toError(err);
      }
    }
  );
}
