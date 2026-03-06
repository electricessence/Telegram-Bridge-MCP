/**
 * Opt-in session recording.
 * Recording is off by default — the agent must explicitly call
 * start_session_recording() to enable it.
 * While active, every inbound update and every bot-sent message is captured.
 */

import type { Update } from "grammy/types";

export interface UserEntry {
  direction: "user";
  update: Update;
}

export interface BotEntry {
  direction: "bot";
  timestamp: string;
  message_id?: number;
  message_ids?: number[];
  content_type: string;
  text?: string;
  caption?: string;
}

export type SessionEntry = UserEntry | BotEntry;

let _active = false;
let _maxUpdates = 50;
let _buffer: SessionEntry[] = [];

export function startRecording(maxUpdates: number = 50): void {
  _active = true;
  _maxUpdates = maxUpdates;
  _buffer = [];
}

export function stopRecording(): void {
  _active = false;
}

export function isRecording(): boolean {
  return _active;
}

/** Called by advanceOffset() — records an inbound user update. */
export function recordUpdate(update: Update): void {
  if (!_active) return;
  if (_buffer.length >= _maxUpdates) _buffer.shift();
  _buffer.push({ direction: "user", update });
}

/** Called by send tools — records an outbound bot message. */
export function recordBotMessage(entry: Omit<BotEntry, "direction" | "timestamp">): void {
  if (!_active) return;
  if (_buffer.length >= _maxUpdates) _buffer.shift();
  _buffer.push({ direction: "bot", timestamp: new Date().toISOString(), ...entry });
}

/** Returns all session entries (user + bot) in capture order (oldest first). */
export function getSessionEntries(): SessionEntry[] {
  return [..._buffer];
}

/** @deprecated Use getSessionEntries() for the full conversation. Kept for backward compat. */
export function getRecordedUpdates(): Update[] {
  return _buffer
    .filter((e): e is UserEntry => e.direction === "user")
    .map((e) => e.update);
}

export function recordedCount(): number {
  return _buffer.length;
}

/** Clears the buffer but keeps recording active with the same max_updates. */
export function clearRecording(): void {
  _buffer = [];
}

export function getMaxUpdates(): number {
  return _maxUpdates;
}
