import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toResult } from "../telegram.js";
import { closeSession, getActiveSession, setActiveSession } from "../session-manager.js";
import { removeSessionQueue } from "../session-queue.js";
import { revokeAllForSession } from "../dm-permissions.js";
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
      if (closed) {
        removeSessionQueue(sid);
        revokeAllForSession(sid);
        if (getActiveSession() === sid) setActiveSession(0);
      }
      return toResult({ closed, sid });
    },
  );
}
