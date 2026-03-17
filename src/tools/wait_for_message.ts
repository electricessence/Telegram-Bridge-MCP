import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, ackVoiceMessage } from "../telegram.js";
import {
  dequeueBatch, pendingCount, waitForEnqueue,
  type TimelineEvent,
} from "../message-store.js";

/** Auto-salute voice messages on dequeue so the user knows we received them. */
function ackVoice(event: TimelineEvent): void {
  if (event.from !== "user" || event.content.type !== "voice") return;
  ackVoiceMessage(event.id);
}

/** Returns true if the event is a user content message (not a reaction or callback). */
function isUserMessage(event: TimelineEvent): boolean {
  return event.from === "user" && event.event === "message";
}

/** Flatten V3's nested content structure into a simple top-level response. */
function flattenMessage(event: TimelineEvent): Record<string, unknown> {
  const c = event.content;
  const result: Record<string, unknown> = {
    timed_out: false,
    message_id: event.id,
    type: c.type,
  };
  if (c.text !== undefined) result.text = c.text;
  if (c.type === "command") {
    result.command = c.text;       // command name (stripped /)
    if (c.data) result.args = c.data;  // command arguments
    // Also include the full text for convenience
    result.text = c.data ? `/${c.text} ${c.data}` : `/${c.text}`;
  }
  if (c.caption !== undefined) result.caption = c.caption;
  if (c.file_id !== undefined) result.file_id = c.file_id;
  if (c.reply_to !== undefined) result.reply_to_message_id = c.reply_to;
  result.pending = pendingCount();
  return result;
}

const DESCRIPTION =
  "Block until a user message arrives, then return it. Designed for agent listen loops — " +
  "call repeatedly to process messages one at a time. Returns { timed_out: true } when no " +
  "message arrives within the timeout window; the expected response is to call wait_for_message " +
  "again immediately. Default timeout: 300 s (5 min). For batch processing or non-blocking " +
  "polls, use dequeue_update instead.";

export function register(server: McpServer) {
  server.registerTool(
    "wait_for_message",
    {
      description: DESCRIPTION,
      inputSchema: {
        timeout_seconds: z
          .number()
          .int()
          .min(1)
          .max(300)
          .default(300)
          .describe("Seconds to block waiting for a user message. Default 300 (5 min). Max 300."),
      },
    },
    async ({ timeout_seconds }, { signal }) => {
      const deadline = Date.now() + timeout_seconds * 1000;
      const abortPromise = new Promise<void>((r) => {
        if (signal.aborted) r();
        else signal.addEventListener("abort", () => { r(); }, { once: true });
      });

      // Loop until we find a user message or timeout
      while (Date.now() < deadline) {
        if (signal.aborted) break;

        // Try immediate dequeue
        const batch = dequeueBatch();
        if (batch.length > 0) {
          // Ack voice on all events
          for (const evt of batch) ackVoice(evt);
          // Find the first user message in the batch
          const msg = batch.find(isUserMessage);
          if (msg) return toResult(flattenMessage(msg));
          // Only reactions/callbacks — keep waiting
        }

        // Wait for next enqueue or timeout
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          waitForEnqueue(),
          new Promise<void>((r) => { timeoutHandle = setTimeout(r, remaining); }),
          abortPromise,
        ]);
        clearTimeout(timeoutHandle);
      }

      return toResult({ timed_out: true });
    },
  );
}
