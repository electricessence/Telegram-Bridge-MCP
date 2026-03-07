/**
 * Shared helpers for button-based interaction tools (choose, send_confirmation).
 *
 * Extracts the repeated: poll → ack → edit lifecycle so individual tools
 * only contain their schema definitions and result-mapping logic.
 */

import type { Update } from "grammy/types";
import { getApi, pollUntil } from "../telegram.js";
import { markdownToV2 } from "../markdown.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ButtonOrTextResult =
  | { kind: "button"; cq: NonNullable<Update["callback_query"]> }
  | { kind: "text";   message_id: number; text: string;   reply_to_message_id?: number }
  | { kind: "voice";  message_id: number; fileId: string; reply_to_message_id?: number };

// ---------------------------------------------------------------------------
// Polling helpers
// ---------------------------------------------------------------------------

/**
 * Polls until a callback_query arrives for a specific message, or times out.
 * Used by send_confirmation (button-only response expected).
 */
export async function pollButtonPress(
  chatId: number,
  messageId: number,
  timeoutSeconds: number,
): Promise<NonNullable<Update["callback_query"]> | null> {
  const { match } = await pollUntil<NonNullable<Update["callback_query"]>>(
    (updates) => {
      const cq = updates.find(
        (u) =>
          u.callback_query &&
          u.callback_query.message?.message_id === messageId &&
          u.callback_query.message?.chat.id === chatId,
      );
      return cq?.callback_query;
    },
    timeoutSeconds,
  );
  return match ?? null;
}

/**
 * Polls until EITHER a callback_query on the given message OR a text/voice
 * message arrives (whichever comes first). Used by choose, where the user
 * may type or speak instead of pressing a button.
 */
export async function pollButtonOrTextOrVoice(
  chatId: number,
  messageId: number,
  timeoutSeconds: number,
): Promise<ButtonOrTextResult | null> {
  const { match } = await pollUntil<ButtonOrTextResult>(
    (updates) => {
      const cq = updates.find(
        (u) =>
          u.callback_query &&
          u.callback_query.message?.message_id === messageId &&
          u.callback_query.message?.chat.id === chatId,
      );
      if (cq?.callback_query) return { kind: "button", cq: cq.callback_query };

      // Only match messages sent AFTER the question (stale-message guard)
      const tm = updates.find((u) => u.message?.text && u.message.message_id > messageId);
      if (tm?.message?.text) return {
        kind: "text",
        message_id: tm.message.message_id,
        text: tm.message.text,
        reply_to_message_id: tm.message.reply_to_message?.message_id,
      };

      const vm = updates.find((u) => u.message?.voice && u.message.message_id > messageId);
      if (vm?.message?.voice) return {
        kind: "voice",
        message_id: vm.message.message_id,
        fileId: vm.message.voice.file_id,
        reply_to_message_id: vm.message.reply_to_message?.message_id,
      };

      return undefined;
    },
    timeoutSeconds,
  );
  return match ?? null;
}

// ---------------------------------------------------------------------------
// Post-press helpers
// ---------------------------------------------------------------------------

async function appendSuffixAndEdit(
  chatId: number,
  messageId: number,
  text: string,
  suffix: string,
): Promise<void> {
  await getApi()
    .editMessageText(chatId, messageId, markdownToV2(`${text}\n\n${suffix}`), {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: [] },
    })
    .catch((e) => { console.error("[button-helpers] editMessageText failed:", e); });
}

/**
 * Acknowledges a callback_query (removes the Telegram spinner) and edits the
 * host message to show ▸ chosenLabel with all buttons removed.
 */
export async function ackAndEditSelection(
  chatId: number,
  messageId: number,
  originalText: string,
  chosenLabel: string,
  callbackQueryId: string | undefined,
): Promise<void> {
  if (callbackQueryId) {
    await getApi()
      .answerCallbackQuery(callbackQueryId)
      .catch(() => {/* non-fatal */});
  }
  await appendSuffixAndEdit(chatId, messageId, originalText, `▸ *${chosenLabel}*`);
}

/**
 * Edits the host message to show ⏱ Timed out with all buttons removed.
 * Used by send_confirmation when no button was pressed within the timeout.
 */
export async function editWithTimedOut(
  chatId: number,
  messageId: number,
  originalText: string,
): Promise<void> {
  await appendSuffixAndEdit(chatId, messageId, originalText, "⏱ _Timed out_");
}

/**
 * Edits the host message to show ⏭ Skipped with all buttons removed.
 * Used by choose when the user typed/spoke instead of pressing a button.
 */
export async function editWithSkipped(
  chatId: number,
  messageId: number,
  originalText: string,
): Promise<void> {
  await appendSuffixAndEdit(chatId, messageId, originalText, "⏭ _Skipped_");
}
