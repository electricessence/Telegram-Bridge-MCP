/**
 * Centralized service message constants.
 *
 * All event-type strings and static service message texts used with
 * `deliverServiceMessage` are defined here. Dynamic messages (those that
 * embed runtime values) are expressed as small functions that return strings.
 *
 * Import the two exported objects:
 *   import { SERVICE_EVENT_TYPES, SERVICE_MESSAGES } from "./service-messages.js";
 */

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

export const SERVICE_EVENT_TYPES = {
  SESSION_ORIENTATION:               "session_orientation",
  SESSION_JOINED:                    "session_joined",
  PENDING_APPROVAL:                  "pending_approval",
  ONBOARDING_TOKEN_SAVE:             "onboarding_token_save",
  ONBOARDING_ROLE:                   "onboarding_role",
  ONBOARDING_PROTOCOL:               "onboarding_protocol",
  ONBOARDING_BUTTONS:                "onboarding_buttons",
  GOVERNOR_CHANGED:                  "governor_changed",
  GOVERNOR_PROMOTED:                 "governor_promoted",
  SESSION_CLOSED:                    "session_closed",
  SHUTDOWN:                          "shutdown",
  BEHAVIOR_NUDGE_FIRST_MESSAGE:      "behavior_nudge_first_message",
  BEHAVIOR_NUDGE_SLOW_GAP:           "behavior_nudge_slow_gap",
  BEHAVIOR_NUDGE_TYPING_RATE:        "behavior_nudge_typing_rate",
  BEHAVIOR_NUDGE_QUESTION_HINT:      "behavior_nudge_question_hint",
  BEHAVIOR_NUDGE_QUESTION_ESCALATION:"behavior_nudge_question_escalation",
} as const;

// ---------------------------------------------------------------------------
// Message text constants
// ---------------------------------------------------------------------------

export const SERVICE_MESSAGES = {
  // ── Onboarding ────────────────────────────────────────────────────────────

  ONBOARDING_TOKEN_SAVE:
    "Save your token. Write it to your session memory file now so you can reconnect after compaction or restart. Token = sid * 1_000_000 + pin. You already have it from session/start.",

  ONBOARDING_PROTOCOL:
    "Signal activity. Never go silent between receiving a message and responding. React immediately on receipt: 🫡 = salute/received (permanent), 👀 = reading/processing (5s temp), 🤔 = thinking/working (temp, clears on send), 👍 = on it (permanent). Use show-typing before every text send. Use animations for long operations. The operator judges responsiveness by what they see, not what you do internally.",

  ONBOARDING_BUTTONS_TEXT:
    "Buttons first. Humans on Telegram prefer tapping over typing.\n" +
    "For yes/no and finite-choice questions, use button presets:\n" +
    "  action(type: \"confirm/ok\")        — single OK (acknowledgment/CTA)\n" +
    "  action(type: \"confirm/ok-cancel\") — OK + Cancel (destructive gate)\n" +
    "  action(type: \"confirm/yn\")        — 🟢 Yes / 🔴 No (binary decision)\n" +
    "  send(type: \"question\", choose: [...]) — custom labeled options\n" +
    "Only use send(type: \"question\", ask: \"...\") for truly free-text input.\n" +
    "Hybrid: send(type: \"text\", text: \"...\", audio: \"...\") — voice note + caption in one message. Use for important updates where the operator may be away from their phone.",

  // ── Governor change notifications ─────────────────────────────────────────

  GOVERNOR_NOW_YOU:
    "You are now the governor. Ambiguous messages will be routed to you.",

  /** @param newLabel color+name label of the new governor session */
  GOVERNOR_NO_LONGER_YOU: (newLabel: string) =>
    `You are no longer the governor. ${newLabel} is now the governor.`,

  /** @param newLabel color+name label of the new governor session */
  GOVERNOR_CHANGED_MSG: (newLabel: string) =>
    `Governor changed: ${newLabel} is now the governor.`,

  /** @param targetName name of the new governor, @param targetSid SID of the new governor */
  GOVERNOR_SWITCHED: (targetName: string, targetSid: number) =>
    `Governor switched: '${targetName}' (SID ${targetSid}) is now the primary session.`,

  // ── Governor promotion (after governor session closes) ───────────────────

  /** @param sessionName name of the session that closed, single-session variant */
  GOVERNOR_PROMOTED_SINGLE: (sessionName: string) =>
    `You are now the governor (${sessionName} closed). Single-session mode restored.`,

  /** @param sessionName name of the session that closed, multi-session variant */
  GOVERNOR_PROMOTED_MULTI: (sessionName: string) =>
    `You are now the governor (${sessionName} closed). Ambiguous messages will be routed to you.`,

  // ── Session closed notifications ──────────────────────────────────────────

  /**
   * Notify a fellow session that a governor-closed session ended and a new governor was promoted.
   * @param sessionName name of the closed session
   * @param sid SID of the closed session
   * @param label name/label of the promoted governor
   * @param nextSid SID of the promoted governor
   */
  SESSION_CLOSED_WITH_NEW_GOVERNOR: (sessionName: string, sid: number, label: string, nextSid: number) =>
    `Session '${sessionName}' (SID ${sid}) has ended. '${label}' (SID ${nextSid}) is now the governor.`,

  /**
   * Notify a fellow session that a session ended (no governor change).
   * @param sessionName name of the closed session
   * @param sid SID of the closed session
   */
  SESSION_CLOSED: (sessionName: string, sid: number) =>
    `Session '${sessionName}' (SID ${sid}) has ended.`,

  // ── Shutdown ──────────────────────────────────────────────────────────────

  SHUTDOWN:
    "⛔ Server shutting down. Your session will be invalidated on restart.",

  // ── Behavior nudges ───────────────────────────────────────────────────────

  NUDGE_FIRST_MESSAGE:
    "This is your first message from the operator. React to acknowledge (message_id is in the update). 👀 = processing, 👍 = on it.",

  /** @param seconds how long the operator waited before a response */
  NUDGE_SLOW_GAP: (seconds: number) =>
    `The operator waited ${seconds}s with no feedback. Signal activity sooner.`,

  NUDGE_TYPING_RATE:
    "Use show_typing after receiving messages to signal you're working.",

  NUDGE_QUESTION_HINT:
    "Tip: for yes/no or finite-choice questions, use action(type: \"confirm/yn\") or choose() — the operator can tap rather than type.",

  NUDGE_QUESTION_ESCALATION:
    "You've sent 10+ questions without buttons. Use action(type: \"confirm/ok-cancel\"), action(type: \"confirm/yn\"), or choose() for any predictable-answer question.",
} as const;
