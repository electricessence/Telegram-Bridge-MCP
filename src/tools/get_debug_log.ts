import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toResult, toError } from "../telegram.js";
import { getDebugLog, debugLogSize, isDebugEnabled, setDebugEnabled, type DebugCategory } from "../debug-log.js";
import { getTraceLog } from "../trace-log.js";
import { requireAuth } from "../session-gate.js";
import { getGovernorSid } from "../routing-mode.js";
import { TOKEN_SCHEMA } from "./identity-schema.js";

const CATEGORIES = ["session", "route", "queue", "cascade", "dm", "animation", "tool", "health"] as const satisfies [string, ...string[]];

const DESCRIPTION =
  "Read the server's debug trace log. Returns recent entries from the in-memory " +
  "ring buffer (max 2 000). Each entry has an auto-incrementing `id` — use " +
  "`since` to fetch only entries newer than a known id (cursor-based pagination). " +
  "Filter by category, limit count, or toggle debug mode. " +
  "Use this to inspect routing decisions, session lifecycle events, queue operations, " +
  "and DM deliveries during a live session. " +
  "Pass `trace: true` to query the behavioral audit trace log instead (always-on, 10 000 entries).";

export function handleGetDebugLog({ count, category, since, enable, trace, session_id, tool, since_ts, token }: {
  count?: number;
  category?: string;
  since?: number;
  enable?: boolean;
  trace?: boolean;
  session_id?: number;
  tool?: string;
  since_ts?: string;
  token: number;
}) {
  const _sid = requireAuth(token);
  if (typeof _sid !== "number") return toError(_sid);

  if (trace) {
    const entries = getTraceLog({
      sid: session_id,
      tool,
      since_ts,
      since_seq: since,
      limit: count ?? 100,
      caller_sid: _sid,
      governor_sid: getGovernorSid(),
    });
    return toResult({
      source: "trace",
      returned: entries.length,
      entries,
    });
  }

  if (enable !== undefined) setDebugEnabled(enable);

  const entries = getDebugLog(count ?? 50, category as DebugCategory | undefined, since);
  return toResult({
    enabled: isDebugEnabled(),
    total: debugLogSize(),
    returned: entries.length,
    entries,
  });
}

export function register(server: McpServer) {
  server.registerTool(
    "get_debug_log",
    {
      description: DESCRIPTION,
      inputSchema: {
        count: z.number().int().min(1).max(500).optional()
          .describe("Max entries to return (default 50 for debug log, 100 for trace log)"),
        category: z.enum(CATEGORIES).optional()
          .describe("Filter to a single debug category (ignored when trace: true)"),
        since: z.number().int().min(0).optional()
          .describe("Only return entries with id/seq > since (cursor-based pagination)"),
        enable: z.boolean().optional()
          .describe("Set to true/false to toggle debug logging on/off (ignored when trace: true)"),
        trace: z.boolean().optional()
          .describe("Pass true to query the behavioral audit trace log instead of the debug log"),
        session_id: z.number().int().positive().optional()
          .describe("trace: Filter to a specific session ID (governor-only for other sessions)"),
        tool: z.string().optional()
          .describe("trace: Filter to a specific tool name"),
        since_ts: z.string().optional()
          .describe("trace: Only return entries at or after this ISO timestamp"),
        token: TOKEN_SCHEMA,
      },
    },
    handleGetDebugLog,
  );
}
