import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stopRecording, clearRecording, isRecording } from "../session-recording.js";

export function register(server: McpServer) {
  server.registerTool(
    "cancel_session_recording",
    {
      description:
        "Stops recording and discards the buffer. " +
        "Call dump_session_record or get_session_updates first if you want to retain the captured updates. " +
        "No-op if recording is not active.",
    },
    async () => {
      const wasActive = isRecording();
      stopRecording();
      clearRecording();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              recording: false,
              was_active: wasActive,
            }),
          },
        ],
      };
    }
  );
}
