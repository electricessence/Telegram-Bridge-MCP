/**
 * Built-in server-level slash commands.
 *
 * These commands are intercepted in the update pipeline *before* any update
 * is delivered to the agent via pollUntil / wait_for_message. The agent never
 * sees them — the server handles them directly and responds to the user.
 *
 * Currently registered:
 *   /session  — shows a contextual session-recording control panel
 *
 * The server registers these in the Telegram command menu on startup so they
 * always appear in autocomplete regardless of what the agent has registered.
 */

import type { Update } from "grammy/types";
import { getApi, resolveChat } from "./telegram.js";
import {
  isRecording,
  startRecording,
  stopRecording,
  recordedCount,
  getMaxUpdates,
  getSessionEntries,
  clearRecording,
  setAutoDump,
  getAutoDumpThreshold,
} from "./session-recording.js";
import { sanitizeSessionEntries } from "./update-sanitizer.js";

// ---------------------------------------------------------------------------
// Tracking panel message IDs so callback_query intercept can route back
// ---------------------------------------------------------------------------

/** Maps from message_id → panel type so we can route callback_queries back to us. */
const _activePanels = new Map<number, "session">();

/** Set to true after sending the startup prefs prompt so we only ask once per process. */
let _sessionPrefsAsked = false;

export function isBuiltInPanelQuery(update: Update): boolean {
  const msgId = update.callback_query?.message?.message_id;
  if (msgId === undefined) return false;
  return _activePanels.has(msgId);
}

// ---------------------------------------------------------------------------
// Public API — called by the update-intercept layer
// ---------------------------------------------------------------------------

/**
 * Sends the one-shot "enable auto recording?" prompt to the user.
 * Called on startup from index.ts. Safe to call multiple times — only fires once.
 */
export async function sendSessionPrefsPrompt(): Promise<void> {
  if (_sessionPrefsAsked) return;
  const chatId = resolveChat();
  if (typeof chatId !== "number") return;
  _sessionPrefsAsked = true;
  const api = getApi();
  try {
    const msg = await api.sendMessage(
      chatId,
      "📼 *Auto session recording?*\nI can capture the full conversation and send periodic dumps as .txt files.",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "Off", callback_data: "session:auto:off" },
            { text: "25 msg", callback_data: "session:auto:25" },
            { text: "50 msg", callback_data: "session:auto:50" },
            { text: "100 msg", callback_data: "session:auto:100" },
          ]],
        },
      },
    );
    _activePanels.set(msg.message_id, "session");
  } catch { /* ignore */ }
}

/** Built-in command metadata (for merging into set_commands menus). */
export const BUILT_IN_COMMANDS = [
  { command: "session", description: "Session recording controls" },
] as const;

/**
 * Returns true if this update is a built-in command or a callback_query for
 * a built-in panel, AND handles it. Returns false if the update should be
 * forwarded to the agent as normal.
 */
export async function handleIfBuiltIn(update: Update): Promise<boolean> {
  // ── Built-in command message ────────────────────────────────────────────
  if (update.message?.text) {
    const entities = update.message.entities ?? [];
    const cmd = entities.find(e => e.type === "bot_command" && e.offset === 0);
    if (cmd) {
      const raw = update.message.text.slice(1, cmd.length).split("@")[0];
      if (raw === "session") {
        await handleSessionCommand();
        return true;
      }
    }
  }

  // ── Callback query for a built-in panel ────────────────────────────────
  if (update.callback_query) {
    const msgId = update.callback_query.message?.message_id;
    if (msgId !== undefined && _activePanels.has(msgId)) {
      await handleSessionCallback(update.callback_query.id, msgId, update.callback_query.data ?? "");
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// /session panel
// ---------------------------------------------------------------------------

async function handleSessionCommand(): Promise<void> {
  const chatId = resolveChat();
  if (typeof chatId !== "number") return;
  const api = getApi();

  const { text, keyboard } = buildSessionPanel();
  try {
    const msg = await api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
    _activePanels.set(msg.message_id, "session");
  } catch { /* ignore */ }
}

async function handleSessionCallback(
  callbackQueryId: string,
  panelMsgId: number,
  data: string,
): Promise<void> {
  const chatId = resolveChat();
  if (typeof chatId !== "number") return;
  const api = getApi();

  // Ack the spinner immediately
  try { await api.answerCallbackQuery(callbackQueryId); } catch { /* ignore */ }

  if (data === "session:dismiss") {
    _activePanels.delete(panelMsgId);
    try { await api.deleteMessage(chatId, panelMsgId); } catch { /* ignore */ }
    return;
  }

  // Auto-recording prefs selection (from startup prompt)
  if (data.startsWith("session:auto:")) {
    _activePanels.delete(panelMsgId);
    try { await api.deleteMessage(chatId, panelMsgId); } catch { /* ignore */ }
    const val = data.slice("session:auto:".length);
    if (val !== "off") {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) {
        startRecording(Math.max(n * 2, 100));
        setAutoDump(n, createAutoDumpFn(chatId, api));
        try {
          await api.sendMessage(chatId, `📼 Recording started — auto-dump every *${n}* messages`, {
            parse_mode: "Markdown",
          });
        } catch { /* ignore */ }
      }
    }
    return;
  }

  if (data === "session:start") {
    startRecording(100);
  } else if (data === "session:stop") {
    stopRecording();
    clearRecording();
  } else if (data === "session:dump") {
    await doSessionDump(chatId, panelMsgId, api);
    return; // doSessionDump deletes the panel itself
  }

  // Refresh the panel with new state
  const { text, keyboard } = buildSessionPanel();
  try {
    await api.editMessageText(chatId, panelMsgId, text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch { /* ignore */ }
}

function createAutoDumpFn(chatId: number, api: ReturnType<typeof getApi>): () => Promise<void> {
  return async () => {
    await doSessionDump(chatId, null, api);
    clearRecording(); // keep recording + auto-dump active; reset buffer only
  };
}

function buildSessionPanel(): { text: string; keyboard: { text: string; callback_data: string }[][] } {
  const recording = isRecording();
  const count = recordedCount();
  const max = getMaxUpdates();
  const autoDump = getAutoDumpThreshold();

  const status = recording
    ? `🔴 Recording · ${count} / ${max} captured${autoDump != null ? ` · auto-dump @${autoDump}` : ""}`
    : `⬛ Not recording`;

  const text = `📼 *Session Recording*\nStatus: ${status}`;

  const keyboard = recording
    ? [
        [
          { text: "📤 Dump", callback_data: "session:dump" },
          { text: "⏹ Stop", callback_data: "session:stop" },
          { text: "✖ Dismiss", callback_data: "session:dismiss" },
        ],
      ]
    : [
        [
          { text: "▶ Start", callback_data: "session:start" },
          { text: "✖ Dismiss", callback_data: "session:dismiss" },
        ],
      ];

  return { text, keyboard };
}

async function doSessionDump(
  chatId: number,
  panelMsgId: number | null,
  api: ReturnType<typeof getApi>,
): Promise<void> {
  if (panelMsgId !== null) {
    _activePanels.delete(panelMsgId);
    try { await api.deleteMessage(chatId, panelMsgId); } catch { /* ignore */ }
  }

  const entries = getSessionEntries();
  const sanitized = await sanitizeSessionEntries(entries);

  // Build the log text inline (same format as dump_session_record)
  const now = new Date().toISOString();
  const lines: string[] = [
    "# Session Recording Log",
    `Generated: ${now}`,
    `Recording: ${isRecording() ? "active" : "inactive"}`,
    `Updates: ${entries.length} / ${getMaxUpdates()}`,
    "",
    "---",
    "",
  ];

  if (sanitized.length === 0) {
    lines.push("(no updates captured)");
  } else {
    sanitized.forEach((u, i) => {
      const from = String(u.from ?? "user");
      const fromLabel = from === "bot" ? "[BOT]" : "[USER]";
      const type = String(u.type ?? "unknown");
      const msgId = u.message_id != null ? `msg_id: ${u.message_id}` : "";

      if (from === "bot") {
        lines.push(`[${i + 1}] ${fromLabel} ${u.content_type ?? "unknown"} | ${msgId}`);
        if (u.text) lines.push(String(u.text));
      } else if (type === "message") {
        lines.push(`[${i + 1}] ${fromLabel} message · ${u.content_type ?? "unknown"} | ${msgId}`);
        if (u.text) lines.push(String(u.text));
        if (u.caption) lines.push(`Caption: ${u.caption}`);
        if (u.file_name) lines.push(`File: ${u.file_name}`);
      } else if (type === "callback_query") {
        lines.push(`[${i + 1}] ${fromLabel} callback_query | ${msgId}`);
        if (u.data) lines.push(`data: ${u.data}`);
      } else {
        lines.push(`[${i + 1}] ${fromLabel} ${type}`);
      }
      lines.push("");
    });
  }

  lines.push("---", "End of log");
  const logText = lines.join("\n");

  // Send as a .txt document if any content, else as a short message
  if (entries.length === 0) {
    try {
      await api.sendMessage(chatId, "📼 *Session Recording*\n_(no updates captured)_", {
        parse_mode: "Markdown",
      });
    } catch { /* ignore */ }
    return;
  }

  try {
    const { InputFile } = await import("grammy");
    const buf = Buffer.from(logText, "utf-8");
    const file = new InputFile(buf, `session-${now.replace(/[:.]/g, "-")}.txt`);
    await api.sendDocument(chatId, file, {
      caption: `📼 Session dump · ${entries.length} updates`,
    });
  } catch {
    // Fallback: send first 4000 chars as a message
    try {
      await api.sendMessage(chatId, `\`\`\`\n${logText.slice(0, 3900)}\n\`\`\``, {
        parse_mode: "Markdown",
      });
    } catch { /* ignore */ }
  }
}
