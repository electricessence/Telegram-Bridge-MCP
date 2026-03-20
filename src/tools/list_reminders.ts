import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toResult, toError } from "../telegram.js";
import { listReminders } from "../reminder-state.js";
import { requireAuth } from "../session-gate.js";
import { IDENTITY_SCHEMA } from "./identity-schema.js";

export function register(server: McpServer) {
  server.registerTool(
    "list_reminders",
    {
      description:
        "List all scheduled reminders (deferred + active) for this session. " +
        "Includes state (deferred/active), delay_seconds, recurring flag, and fires_in_seconds for deferred reminders.",
      inputSchema: {
        identity: IDENTITY_SCHEMA,
      },
    },
    ({ identity }) => {
      const _sid = requireAuth(identity);
      if (typeof _sid !== "number") return toError(_sid);

      const now = Date.now();
      const reminders = listReminders().map(r => {
        const entry: Record<string, unknown> = {
          id: r.id,
          text: r.text,
          delay_seconds: r.delay_seconds,
          recurring: r.recurring,
          state: r.state,
        };
        if (r.state === "deferred") {
          entry.fires_in_seconds = Math.max(
            0,
            Math.ceil((r.created_at + r.delay_seconds * 1000 - now) / 1000),
          );
        }
        return entry;
      });
      return toResult({ reminders });
    },
  );
}
