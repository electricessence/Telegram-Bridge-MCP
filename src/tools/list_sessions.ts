import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toResult, toError } from "../telegram.js";
import { listSessions, getActiveSession } from "../session-manager.js";
import { TOKEN_SCHEMA } from "./identity-schema.js";
import { requireAuth } from "../session-gate.js";

const DESCRIPTION =
  "List active sessions. " +
  "Without a token: returns only the list of active session IDs (no names, no details). " +
  "With a valid token: returns full session details (ID, name, color, createdAt) and the active SID. " +
  "Use the unauthenticated form to discover which session IDs exist before authenticating.";

export function register(server: McpServer) {
  server.registerTool(
    "list_sessions",
    {
      description: DESCRIPTION,
      inputSchema: {
        token: TOKEN_SCHEMA.optional().describe(
          "Session token from session_start (sid * 1_000_000 + pin). " +
          "Omit for an unauthenticated probe that returns only session IDs.",
        ),
      },
    },
    (args: { token?: number }) => {
      const { token } = args;

      // Unauthenticated probe — return only SID numbers, no details
      if (token === undefined) {
        const sids = listSessions().map((s) => s.sid);
        return toResult({ sessions: sids });
      }

      // Authenticated call — validate token and return full details
      const sid = requireAuth(token);
      if (typeof sid !== "number") return toError(sid);

      const sessions = listSessions();
      const active = getActiveSession();
      return toResult({ sessions, active_sid: active });
    },
  );
}
