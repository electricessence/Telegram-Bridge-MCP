/**
 * Opt-in session recording.
 * Recording is off by default — the agent must explicitly call
 * start_session_recording() to enable it.
 * While active, every update that passes through advanceOffset() is captured.
 */

import type { Update } from "grammy/types";

let _active = false;
let _maxUpdates = 50;
let _buffer: Update[] = [];

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

/** Called by advanceOffset() — no-op when recording is off. */
export function recordUpdate(update: Update): void {
  if (!_active) return;
  if (_buffer.length >= _maxUpdates) _buffer.shift();
  _buffer.push(update);
}

export function getRecordedUpdates(): Update[] {
  return [..._buffer];
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
