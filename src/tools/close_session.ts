import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toResult, sendServiceMessage } from "../telegram.js";
import { closeSession, getActiveSession, setActiveSession, listSessions } from "../session-manager.js";
import { removeSessionQueue } from "../session-queue.js";
import { revokeAllForSession } from "../dm-permissions.js";
import { getGovernorSid, setRoutingMode } from "../routing-mode.js";
import { SESSION_AUTH_SCHEMA, checkAuth } from "../session-auth.js";

const DESCRIPTION =
  "Close the current session. Removes it from the active " +
  "session list and cleans up resources. The session ID " +
  "cannot be reclaimed after closure.";

export function register(server: McpServer) {
  server.registerTool(
    "close_session",
    {
      description: DESCRIPTION,
      inputSchema: {
        ...SESSION_AUTH_SCHEMA,
      },
    },
    ({ sid, pin }) => {
      const authErr = checkAuth(sid, pin);
      if (authErr) return authErr;

      const closed = closeSession(sid);
      if (!closed) return toResult({ closed: false, sid });

      removeSessionQueue(sid);
      revokeAllForSession(sid);
      if (getActiveSession() === sid) setActiveSession(0);

      // Governor death recovery: promote next session or fall back to load_balance
      if (sid === getGovernorSid()) {
        const remaining = listSessions().sort((a, b) => a.sid - b.sid);
        if (remaining.length > 0) {
          const next = remaining[0];
          setRoutingMode("governor", next.sid);
          const label = next.name || `Session ${next.sid}`;
          sendServiceMessage(
            `⚠️ Governor session closed. 🤖 ${label} promoted to governor.`,
          ).catch(() => {});
        } else {
          setRoutingMode("load_balance");
          sendServiceMessage(
            "⚠️ Governor session closed. Routing mode reset to *load_balance*.",
          ).catch(() => {});
        }
      }

      return toResult({ closed: true, sid });
    },
  );
}
