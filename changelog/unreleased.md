# [Unreleased]

## Added

- `dist/launcher.js` — stdio-to-HTTP bridge that auto-starts the Streamable HTTP server if none is running, then bridges stdin/stdout to it. Lets stdio-only hosts share a single server instance.

## Breaking Changes

- **Identity token redesign** — all tools now accept `token: number` (single integer) instead of `identity: [sid, pin]` (array tuple). See `changelog/2026-04-03_v5.0.0.md`.

## Fixed

- `dequeue_update`: `timeout` parameter changed from `.default(300)` to `.optional()` — callers that omit `timeout` now receive their per-session default (configured via `set_dequeue_default`) instead of always waiting 300 s. (#10-249)
- `set_dequeue_default`: timeout value is now capped at 3600 s (1 hour) via schema validation, preventing runaway wait durations. (#10-250)
- `dequeue_update`: internal `setTimeout` call is clamped to `MAX_SET_TIMEOUT_MS` (2,000,000,000 ms) to prevent Node.js timer overflow when very large `waitMs` values reach the wait loop. (#10-250)

## Changed

- Documentation restructured to recommend Streamable HTTP as the primary transport; stdio demoted to collapsible fallback section in README and setup guide.
- Docker documentation updated with HTTP-mode example and pairing note.
