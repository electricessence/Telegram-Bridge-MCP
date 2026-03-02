import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError, pollUntil } from "../telegram.js";

/**
 * Long-polls for a callback_query update (inline button press).
 *
 * Because Telegram's getUpdates is used as a single long-poll call, the agent
 * simply awaits this tool and gets back the result once the user presses a
 * button — no polling loop needed on the caller side.
 *
 * Filtering behaviour:
 *  - All received updates advance the offset (nothing is skipped silently).
 *  - Only callback_query updates are inspected for the filter match.
 *  - Non-matching updates are still consumed so they don't block the queue.
 */
export function register(server: McpServer) {
  server.registerTool(
    "wait_for_callback_query",
    {
      description: "Blocks (long-poll) until an inline button is pressed, then returns the callback data. Low-level primitive — use only when buttons must remain active across multiple presses (e.g. persistent or broadcast keyboards). For single-use Yes/No use send_confirmation; for single-use N-option use choose.",
      inputSchema: {
        timeout_seconds: z
        .number()
        .int()
        .min(1)
        .max(300)
        .default(60)
        .describe("How long to wait for a button press (1–300 s)"),
      message_id: z
        .number()
        .int()
        .optional()
        .describe("Only accept callbacks on this specific message"),
      },
    },
    async ({ timeout_seconds, message_id }) => {
      try {
        const { match } = await pollUntil(
          (updates) => {
            const cq = updates.find((u) => {
              if (!u.callback_query) return false;
              if (message_id !== undefined && u.callback_query.message?.message_id !== message_id) return false;
              return true;
            });
            return cq?.callback_query;
          },
          timeout_seconds,
        );

        if (!match) {
          return toResult({ timed_out: true });
        }

        return toResult({
          timed_out: false,
          callback_query_id: match.id,
          data: match.data,
          message_id: match.message?.message_id,
        });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
