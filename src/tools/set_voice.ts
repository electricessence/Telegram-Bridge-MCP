import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { getSessionVoice, setSessionVoice, clearSessionVoice } from "../voice-state.js";
import { requireAuth } from "../session-gate.js";
import { IDENTITY_SCHEMA } from "./identity-schema.js";

const DESCRIPTION =
  "Sets a per-session TTS voice override (e.g. \"alloy\", \"nova\", \"echo\"). " +
  "Overrides the global default for this session only — other sessions are unaffected. " +
  "Pass an empty string to clear the override and revert to the global default. " +
  "Use list_voices (if available) to discover the voices supported by your TTS provider.";

export function register(server: McpServer) {
  server.registerTool(
    "set_voice",
    {
      description: DESCRIPTION,
      inputSchema: {
        voice: z
          .string()
          .max(64)
          .describe("Voice name to set for this session, e.g. \"alloy\". Pass empty string to clear."),
        identity: IDENTITY_SCHEMA,
      },
    },
    ({ voice, identity }) => {
      const _sid = requireAuth(identity);
      if (typeof _sid !== "number") return toError(_sid);
      const previous = getSessionVoice();
      if (voice.trim() === "") {
        clearSessionVoice();
        return toResult({ voice: null, previous, cleared: true });
      }
      setSessionVoice(voice);
      return toResult({ voice: getSessionVoice(), previous, set: true });
    },
  );
}
