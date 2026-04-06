import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { enableLogging, disableLogging, isLoggingEnabled } from "../local-log.js";
import { requireAuth } from "../session-gate.js";
import { TOKEN_SCHEMA } from "./identity-schema.js";

const DESCRIPTION =
  "Enable or disable local session logging. " +
  "When disabled, no new events are written to the log file. " +
  "The current log buffer is not flushed on disable — use roll_log first if you want to archive it. " +
  "Returns the current logging state after the change.";

export function register(server: McpServer) {
  server.registerTool(
    "toggle_logging",
    {
      description: DESCRIPTION,
      inputSchema: {
        enabled: z
          .boolean()
          .describe("Set to true to enable logging, false to disable."),
        token: TOKEN_SCHEMA,
      },
    },
    ({ enabled, token }) => {
      const _sid = requireAuth(token);
      if (typeof _sid !== "number") return toError(_sid);

      if (enabled) {
        enableLogging();
      } else {
        disableLogging();
      }

      return toResult({ logging_enabled: isLoggingEnabled() });
    }
  );
}
