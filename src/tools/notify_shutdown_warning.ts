import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { requireAuth } from "../session-gate.js";
import { listSessions } from "../session-manager.js";
import { deliverDirectMessage } from "../session-queue.js";
import { IDENTITY_SCHEMA } from "./identity-schema.js";

const DEFAULT_MESSAGE =
  "⛔ Shutdown warning: the server is restarting soon. " +
  "Complete any in-progress work. Do not retry dequeue_update after shutdown. " +
  "Wait ~60s, then call session_start to re-establish your session.";

const DESCRIPTION =
  "Send a pre-shutdown advisory DM to all other active sessions. " +
  "Use this before calling `shutdown` so workers have time to wrap up. " +
  "Does NOT shut down the server — call `shutdown` separately when ready. " +
  "Returns the count of sessions notified.";

export function register(server: McpServer) {
  server.registerTool(
    "notify_shutdown_warning",
    {
      description: DESCRIPTION,
      inputSchema: {
        identity: IDENTITY_SCHEMA,
        reason: z
          .string()
          .optional()
          .describe("Optional reason for the restart (e.g. \"code update\", \"config change\")"),
        wait_seconds: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Optional estimated wait time in seconds before restart"),
      },
    },
    ({ identity, reason, wait_seconds }) => {
      const sid = requireAuth(identity);
      if (typeof sid !== "number") return toError(sid);

      const others = listSessions().filter(s => s.sid !== sid);
      if (others.length === 0) {
        return toResult({ notified: 0, message: "No other sessions active" });
      }

      const parts: string[] = [DEFAULT_MESSAGE];
      if (reason) parts.push(`Reason: ${reason}`);
      if (typeof wait_seconds === "number") {
        parts.push(`Estimated restart time: ~${wait_seconds}s`);
      }
      const text = parts.join("\n");

      let notified = 0;
      for (const s of others) {
        if (deliverDirectMessage(sid, s.sid, text)) notified++;
      }

      return toResult({ notified });
    },
  );
}
