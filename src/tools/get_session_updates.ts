import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { getSessionEntries, isRecording, recordedCount } from "../session-recording.js";
import { sanitizeSessionEntries } from "../update-sanitizer.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_session_updates",
    {
      description:
        "Returns updates captured since start_session_recording was called. " +
        "Returns newest-first by default. " +
        "Recording must be started with start_session_recording before any updates are captured.",
      inputSchema: {
        messages: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max number of messages to return. Omit to return all captured."),
        oldest_first: z
          .boolean()
          .optional()
          .describe("If true, return oldest updates first. Default is newest-first."),
      },
    },
    async ({ messages, oldest_first }) => {
      try {
        const all = getSessionEntries(); // oldest → newest
        const ordered = oldest_first ? all : [...all].reverse();
        const slice = messages ? ordered.slice(0, messages) : ordered;
        const sanitized = await sanitizeSessionEntries(slice);
        return toResult({
          recording: isRecording(),
          total_captured: recordedCount(),
          returned: sanitized.length,
          updates: sanitized,
        });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
