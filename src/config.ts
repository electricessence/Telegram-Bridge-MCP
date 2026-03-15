/**
 * Persistent MCP configuration — stored as JSON next to .env.
 *
 * Session log mode:
 *   - undefined / missing key → disabled (no dumps)
 *   - "manual"                → always recording, manual dumps only
 *   - number (e.g. 50)       → always recording + auto-dump every N events
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "..", "mcp-config.json");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface McpConfig {
  sessionLog?: "manual" | number;
}

// ---------------------------------------------------------------------------
// In-memory cache (loaded once, written on change)
// ---------------------------------------------------------------------------

let _config: McpConfig = {};

function load(): McpConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as McpConfig;
  } catch {
    return {};
  }
}

function save(): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2) + "\n", "utf-8");
  } catch {
    // Best-effort — ignore disk errors (read-only containers, permission denied, etc.)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load config from disk. Call once at startup. */
export function loadConfig(): void {
  _config = load();
}

/**
 * Session log mode:
 *   - `null`     → disabled
 *   - `"manual"` → recording, manual dumps
 *   - `number`   → recording + auto-dump every N events
 */
export function getSessionLogMode(): "manual" | number | null {
  const val = _config.sessionLog;
  if (val === "manual") return "manual";
  if (typeof val === "number" && val > 0) return val;
  return null;
}

/** Set session log mode and persist to disk. */
export function setSessionLogMode(mode: "manual" | number | null): void {
  if (mode === null) {
    delete _config.sessionLog;
  } else if (mode === "manual") {
    _config.sessionLog = mode;
  } else {
    const clamped = Math.floor(mode);
    if (Number.isFinite(clamped) && clamped >= 1) {
      _config.sessionLog = clamped;
    } else {
      delete _config.sessionLog;
    }
  }
  save();
}

/** Human-readable label for the current mode. */
export function sessionLogLabel(): string {
  const mode = getSessionLogMode();
  if (mode === null) return "disabled";
  if (mode === "manual") return "manual";
  return `every ${mode} messages`;
}

/** For testing only. */
export function resetConfigForTest(): void {
  _config = {};
}
