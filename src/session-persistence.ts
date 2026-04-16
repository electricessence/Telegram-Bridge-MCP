/**
 * Session state persistence for fast restart / bounce protocol.
 *
 * On a planned shutdown (session/bounce), session state is snapshotted to disk.
 * On the next startup, the snapshot is loaded, sessions are restored, and the
 * Telegram poller offset is rewound to prevent duplicate update delivery.
 *
 * File location: next to mcp-config.json (project root).
 * Write strategy: write to .tmp then renameSync (atomic on POSIX, best-effort on Windows).
 */

import { existsSync, writeFileSync, readFileSync, renameSync, unlinkSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Path to the session-state snapshot file. */
export const SESSION_STATE_PATH = resolve(__dirname, "..", "data", "session-snapshot.json");

/** Current snapshot schema version — bump when the shape changes incompatibly. */
const SNAPSHOT_VERSION = 1;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SessionSnapshot {
  sid: number;
  pin: number;
  name: string;
  color: string;
  createdAt: string;
  dequeueDefault?: number;
}

export interface PersistedSession {
  version: number;
  governorSid: number;
  pollerOffset: number;
  sessions: SessionSnapshot[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomically persist session state to disk.
 * Imported lazily to avoid circular imports (session-manager ← this ← session-manager).
 */
export async function saveSessionState(): Promise<void> {
  const [
    { listSessions, getSession },
    { getGovernorSid },
    { getPollerOffset },
  ] = await Promise.all([
    import("./session-manager.js"),
    import("./routing-mode.js"),
    import("./telegram.js"),
  ]);

  const sessions: SessionSnapshot[] = listSessions().map((info) => {
    const full = getSession(info.sid);
    return {
      sid: info.sid,
      pin: full?.pin ?? 0,
      name: info.name,
      color: info.color,
      createdAt: info.createdAt,
      ...(full?.dequeueDefault !== undefined && { dequeueDefault: full.dequeueDefault }),
    };
  });

  const snapshot: PersistedSession = {
    version: SNAPSHOT_VERSION,
    governorSid: getGovernorSid(),
    pollerOffset: getPollerOffset(),
    sessions,
  };

  const tmpPath = SESSION_STATE_PATH + ".tmp";
  mkdirSync(dirname(SESSION_STATE_PATH), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
  renameSync(tmpPath, SESSION_STATE_PATH);
  process.stderr.write(`[session-persistence] saved ${sessions.length} session(s) to snapshot\n`);
}

/**
 * Load the session snapshot from disk.
 * Returns null if the file does not exist, is unreadable, or has a schema mismatch.
 */
export function loadSessionState(): PersistedSession | null {
  if (!existsSync(SESSION_STATE_PATH)) return null;
  try {
    const raw = readFileSync(SESSION_STATE_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as Record<string, unknown>).version !== SNAPSHOT_VERSION
    ) {
      process.stderr.write("[session-persistence] snapshot version mismatch or invalid — discarding\n");
      return null;
    }
    const snap = parsed as PersistedSession;
    if (!Array.isArray(snap.sessions)) return null;
    return snap;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[session-persistence] failed to load snapshot: ${msg} — discarding\n`);
    return null;
  }
}

/** Delete the session snapshot file. Best-effort — swallows errors. */
export function clearSessionState(): void {
  try {
    if (existsSync(SESSION_STATE_PATH)) {
      unlinkSync(SESSION_STATE_PATH);
      process.stderr.write("[session-persistence] snapshot cleared\n");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[session-persistence] failed to clear snapshot: ${msg}\n`);
  }
}

/**
 * Expire the restored-session set and delete the snapshot file.
 *
 * Called 5 minutes after startup to ensure stale snapshots cannot permanently
 * bypass operator approval. Any sessions that have not completed their
 * `session/restore` token exchange by this point will lose their auto-approve
 * bypass and must go through the normal reconnect dialog.
 */
export async function expireRestoredSessions(): Promise<void> {
  const { resetRestoredSids } = await import("./session-manager.js");
  resetRestoredSids();
  clearSessionState();
  process.stderr.write("[session-persistence] restored-session snapshot expired\n");
}
