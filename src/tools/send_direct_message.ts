import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { SESSION_AUTH_SCHEMA, checkAuth } from "../session-auth.js";
import { getSession } from "../session-manager.js";
import { hasDmPermission } from "../dm-permissions.js";
import { deliverDirectMessage } from "../session-queue.js";

const DESCRIPTION =
  "Send a direct message to another session. The message is " +
  "delivered internally — it never appears in the Telegram chat. " +
  "Requires DM permission (granted by the operator via " +
  "request_dm_access). The target session receives the message " +
  "in its dequeue stream as a direct_message event.";

export function register(server: McpServer) {
  server.registerTool(
    "send_direct_message",
    {
      description: DESCRIPTION,
      inputSchema: {
        ...SESSION_AUTH_SCHEMA,
        target_sid: z
          .number()
          .int()
          .positive()
          .describe("Session ID of the recipient"),
        text: z
          .string()
          .min(1)
          .describe("Message text to send"),
      },
    },
    ({ sid, pin, target_sid, text }) => {
      const authErr = checkAuth(sid, pin);
      if (authErr) return authErr;

      if (sid === target_sid) {
        return toError({
          code: "DM_SELF",
          message: "Cannot send a DM to yourself",
        });
      }

      const target = getSession(target_sid);
      if (!target) {
        return toError({
          code: "SESSION_NOT_FOUND",
          message: `Session ${target_sid} does not exist`,
        });
      }

      if (!hasDmPermission(sid, target_sid)) {
        return toError({
          code: "DM_NOT_PERMITTED",
          message:
            `No DM permission for session ${sid} → ${target_sid}. ` +
            "Use request_dm_access to ask the operator for permission.",
        });
      }

      const delivered = deliverDirectMessage(sid, target_sid, text);
      if (!delivered) {
        return toError({
          code: "DM_DELIVERY_FAILED",
          message: `Session ${target_sid} queue not available`,
        });
      }

      return toResult({ delivered: true, target_sid });
    },
  );
}
