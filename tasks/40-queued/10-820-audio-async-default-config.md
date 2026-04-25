---
id: 10-820
title: Audio sends async by default, controlled by config
status: draft
priority: 10
origin: operator voice 2026-04-24
---

# 10-820 — Audio sends async by default, controlled by config

## Problem

Today, `send(type: "text", audio: "...")` is synchronous by default. Async is opt-in via `async: true`. Long TTS hits 504 silently or blocks the agent's turn for 60+ seconds. Operators see silent drops and blocking gaps; agents waste turn-time.

## Desired behavior

- New config setting: `audio_async_default` (boolean, default `true`).
- When `send()` receives an `audio` param:
  - If `audio_async_default` is true AND caller did not pass `async`, treat as async (per 10-803 contract).
  - If `audio_async_default` is true AND caller passed `async: false`, treat as sync.
  - If `audio_async_default` is false, behavior unchanged from 10-803.
- For non-audio sends (text-only, file, notification, etc.), no change.

## Acceptance criteria

- [ ] Config key `audio_async_default` accepted; default value `true`.
- [ ] Audio sends without explicit `async` flag are async by default.
- [ ] `async: false` per-call still forces sync.
- [ ] Non-audio sends unchanged.
- [ ] Changelog entry under "Behavior change" calling out the default flip — existing flows that expected synchronous immediate `message_id` on audio sends must add `async: false` to opt back in.
- [ ] help('send') documents the new default and the override.
- [ ] Existing 10-803 async path remains the implementation under the hood.

## Constraints

- Don't break existing `async: true` callers — same return shape (`message_id_pending`, `status: queued`, callback) applies.
- Don't change FIFO ordering semantics from 10-803.
- Config change must be runtime-modifiable (no restart) so the dogfood loop can flip it on/off without rebuilding.

## Don'ts

- Don't make audio_async_default false by default. Operator wants async on.
- Don't apply async to non-audio sends. Sync is correct for short text.

## Open

- Should `audio_async_default` be per-session (profile-driven) or bridge-global? Lean: bridge-global config; per-session override later if needed.
