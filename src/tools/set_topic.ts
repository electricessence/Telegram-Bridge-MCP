import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult } from "../telegram.js";
import { setTopic, getTopic, clearTopic } from "../topic-state.js";

/**
 * Sets a default title that is automatically prepended to every outbound
 * message for the lifetime of this MCP server process as "[Title]".
 *
 * Typical use: call once at session start so all messages from this agent
 * instance are visually tagged in Telegram — e.g. "[Refactor Agent] Build
 * complete" instead of just "Build complete". Makes it easy to tell which
 * VS Code window sent what when multiple instances share the same Telegram chat.
 *
 * SCOPE: This title is process-scoped (module-level singleton). It works
 * correctly when each VS Code instance runs its own MCP server process
 * (one Telegram-facing chat per window). If multiple chat sessions share
 * the same VS Code window they share one process — the last set_topic call
 * wins. For single-window / single-chat use, this is not a concern.
 *
 * Pass an empty string to clear the title and return to untagged messages.
 */
export function register(server: McpServer) {
  server.registerTool(
    "set_topic",
    {
      description: "Sets a default title (e.g. \"Refactor Agent\") that is automatically prepended to every outbound message from this MCP server instance as \"[Title]\". Useful when multiple VS Code windows share the same Telegram chat — each process can label its messages so you know which agent sent what. Scoped to this server process: works best with one active chat per VS Code instance. Pass an empty string to clear.",
      inputSchema: {
        topic: z
        .string()
        .max(32)
        .describe("Short label to prepend to all outbound messages, e.g. \"Refactor Agent\". Pass empty string to clear."),
      },
    },
    async ({ topic }) => {
      const previous = getTopic();
      if (topic.trim() === "") {
        clearTopic();
        return toResult({ topic: null, previous, cleared: true });
      }
      setTopic(topic);
      return toResult({ topic: getTopic(), previous, set: true });
    },
  );
}
