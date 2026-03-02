import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveChat, toResult, toError, validateText } from "../telegram.js";

/**
 * Calls sendMessageDraft via raw fetch since grammY does not yet support this
 * method (added in Bot API 9.3, opened to all bots in Bot API 9.5 / March 1 2026).
 */
export async function sendMessageDraft(params: {
  chat_id: number;
  draft_id: number;
  text: string;
  parse_mode?: string;
  message_thread_id?: number;
}): Promise<true> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN not set");

  const body: Record<string, unknown> = {
    chat_id: params.chat_id,
    draft_id: params.draft_id,
    text: params.text,
  };
  if (params.parse_mode) body.parse_mode = params.parse_mode;
  if (params.message_thread_id) body.message_thread_id = params.message_thread_id;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessageDraft`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const json = (await res.json()) as { ok: boolean; description?: string; error_code?: number };
  if (!json.ok) {
    throw new Error(json.description ?? `Telegram API error ${json.error_code}`);
  }
  return true;
}

export function register(server: McpServer) {
  server.registerTool(
    "send_message_draft",
    {
      description: "Sends a draft (partial/streaming) message to the user via Telegram's sendMessageDraft API (Bot API 9.5). " +
    "Use the same draft_id across multiple calls to update the visible draft in place — Telegram animates the change. " +
    "Each call replaces the entire draft text, so pass the full current content each time. " +
    "draft_id must be a non-zero integer; use any consistent value (e.g. 1) per draft session. " +
    "Only works in private chats. Default parse_mode is Markdown (auto-converted, safe even for partial/streaming text — unclosed spans are auto-closed). " +
    "Omit parse_mode for plain text, or use HTML/MarkdownV2 for manual control.\n\n" +
    "⚠ TOKEN COST WARNING: Each call must include the FULL accumulated text (not a delta). " +
    "Calling this N times with growing text costs O(N²) total tokens — a 500-token response sent " +
    "token-by-token would consume ~125,000 tokens in tool arguments alone. " +
    "DO NOT call this in a loop with incremental text. " +
    "Acceptable uses: one call with a nearly-complete draft before a slow operation, " +
    "or a small fixed number of milestone updates (e.g. section-by-section). " +
    "For normal replies, use send_message instead — it has no overhead.",
      inputSchema: {
        draft_id: z
        .number()
        .int()
        .min(1)
        .describe("Unique non-zero identifier for this draft session. Use the same ID for all streaming calls to animate updates."),
      text: z
        .string()
        .describe("Current full text of the draft (1-4096 chars). Each call replaces the entire visible draft."),
      parse_mode: z
        .enum(["Markdown", "HTML", "MarkdownV2"])
        .optional()
        .describe("Omit for plain text (safest for partial/streaming content). Markdown = standard Markdown auto-converted (only safe for complete, well-formed text). MarkdownV2 = raw Telegram V2 (manual escaping required); HTML = HTML tags"),
      message_thread_id: z
        .number()
        .int()
        .optional()
        .describe("Target message thread (topic) ID for private chats with forum topics enabled."),
      },
    },
    async ({ draft_id, text, parse_mode, message_thread_id }) => {
      const chatId = resolveChat();
      if (typeof chatId !== "string") return toError(chatId);

      let finalText = text;
      let finalMode: string | undefined = parse_mode;
      if (parse_mode === "Markdown") {
        const { markdownToV2 } = await import("../markdown.js");
        // partial mode (default): unclosed spans auto-close so every chunk renders correctly
        finalText = markdownToV2(text);
        finalMode = "MarkdownV2";
      }

      const textErr = validateText(finalText);
      if (textErr) return toError(textErr);

      const chatIdInt = parseInt(chatId, 10);
      if (isNaN(chatIdInt)) {
        return toError({ code: "INVALID_CHAT_ID", message: "sendMessageDraft requires a numeric chat_id (private chats only)." });
      }

      try {
        await sendMessageDraft({
          chat_id: chatIdInt,
          draft_id,
          text: finalText,
          parse_mode: finalMode,
          message_thread_id,
        });
        return toResult({ ok: true, draft_id });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
