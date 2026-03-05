import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { startRecording, isRecording, recordedCount } from "../session-recording.js";

export function register(server: McpServer) {
  server.registerTool(
    "start_session_recording",
    {
      description:
        "Begins recording incoming updates in memory for this session. " +
        "Recording is off by default — call this to opt in. " +
        "Calling again resets the buffer and applies the new max_updates limit. " +
        "Use get_session_updates to retrieve what was recorded. " +
        "Use cancel_session_recording to stop and discard the buffer, or dump_session_record(stop: true) to export then stop.",
      inputSchema: {
        max_updates: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Maximum number of updates to keep in memory (oldest are dropped). Default 50."),
      },
    },
    async ({ max_updates }) => {
      const wasActive = isRecording();
      startRecording(max_updates);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recording: true,
              reset: wasActive,
              max_updates,
              captured: recordedCount(),
            }),
          },
        ],
      };
    }
  );
}
