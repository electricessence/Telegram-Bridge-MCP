import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getApi, toResult, toError, resolveChat } from "../telegram.js";
import { markdownToV2 } from "../markdown.js";
import { SESSION_AUTH_SCHEMA, checkAuth } from "../session-auth.js";
import { getSession } from "../session-manager.js";
import { hasDmPermission, grantDm } from "../dm-permissions.js";
import {
  pollButtonPress,
  ackAndEditSelection,
  type ButtonStyle,
} from "./button-helpers.js";

const GRANT_DATA = "dm_grant";
const DENY_DATA = "dm_deny";
const GRANT_LABEL = "✔ Allow";
const DENY_LABEL = "✘ Deny";

const CONFIRM_TIMEOUT_S = 120;

const DESCRIPTION =
  "Request permission to send direct messages to another session. " +
  "The operator is shown a confirmation prompt. On approval, the " +
  "DM channel opens (one-way: caller → target). Bidirectional " +
  "requires separate requests from each side.";

export function register(server: McpServer) {
  server.registerTool(
    "request_dm_access",
    {
      description: DESCRIPTION,
      inputSchema: {
        ...SESSION_AUTH_SCHEMA,
        target_sid: z
          .number()
          .int()
          .positive()
          .describe("Session ID to request DM access to"),
      },
    },
    async ({ sid, pin, target_sid }, { signal }) => {
      const authErr = checkAuth(sid, pin);
      if (authErr) return authErr;

      if (sid === target_sid) {
        return toError({
          code: "DM_SELF",
          message: "Cannot request DM access to yourself",
        });
      }

      const target = getSession(target_sid);
      if (!target) {
        return toError({
          code: "SESSION_NOT_FOUND",
          message: `Session ${target_sid} does not exist`,
        });
      }

      if (hasDmPermission(sid, target_sid)) {
        return toResult({
          already_granted: true,
          sender: sid,
          target_sid,
        });
      }

      const chatId = resolveChat();
      if (typeof chatId !== "number") return toError(chatId);

      const sender = getSession(sid);
      const senderName = sender?.name || `Session ${sid}`;
      const targetName = target.name || `Session ${target_sid}`;
      const promptText =
        `${senderName} wants to send direct messages to ${targetName}.`;

      try {
        const sent = await getApi().sendMessage(
          chatId,
          markdownToV2(promptText),
          {
            parse_mode: "MarkdownV2",
            reply_markup: {
              inline_keyboard: [[
                {
                  text: GRANT_LABEL,
                  callback_data: GRANT_DATA,
                  style: "success" as ButtonStyle,
                },
                {
                  text: DENY_LABEL,
                  callback_data: DENY_DATA,
                  style: "danger" as ButtonStyle,
                },
              ]],
            },
            _rawText: promptText,
          } as Record<string, unknown>,
        );

        const result = await pollButtonPress(
          chatId,
          sent.message_id,
          CONFIRM_TIMEOUT_S,
          signal,
        );

        if (!result) {
          await ackAndEditSelection(
            chatId,
            sent.message_id,
            promptText,
            "timed out",
            undefined,
          ).catch(() => {/* non-fatal */});
          return toResult({ timed_out: true, message_id: sent.message_id });
        }

        const granted = result.data === GRANT_DATA;
        const chosenLabel = granted ? GRANT_LABEL : DENY_LABEL;

        await ackAndEditSelection(
          chatId,
          sent.message_id,
          promptText,
          chosenLabel,
          result.callback_query_id,
        );

        if (granted) {
          grantDm(sid, target_sid);
        }

        return toResult({
          granted,
          sender: sid,
          target_sid,
          message_id: sent.message_id,
        });
      } catch (err) {
        return toError(err);
      }
    },
  );
}
