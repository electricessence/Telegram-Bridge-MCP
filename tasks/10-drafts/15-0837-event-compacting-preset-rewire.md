---
id: 15-0837
title: Event endpoint — dedicated compacting + recovering animations
priority: 15
status: draft
type: feature
delegation: any
---

# Event endpoint — dedicated `compacting` + `recovering` animations

`POST /event` `compacting` and `compacted` should each trigger their own visible animation, not reuse `working` (compacting) and bare-cancel (compacted). The post-compaction animation gives the agent a visible recovery window to re-orient before the next operator turn.

## Current state

- `src/event-endpoint.ts` `KIND_ANIMATION` map: `compacting: "working"`.
- `src/event-endpoint.ts` `compacted` branch: calls `handleCancelAnimation` (clears any running animation, shows nothing).
- `src/animation-state.ts` `BUILTIN_PRESETS`: `compacting` exists as a single static frame `["👨‍💻 compacting..."]`. No `recovering` preset.

## Acceptance criteria

1. `BUILTIN_PRESETS.compacting`: replace single-frame entry with a multi-frame, monospace, dot-style animation in the same family as `working`/`thinking`/`loading`. Word shown: `compacting`.
2. `BUILTIN_PRESETS.recovering` (new): same monospace dot-family style. Word shown: `recovering from compaction` (or shorter if line length forces it). Operator's intent is to clearly signal a post-compaction reorient window.
3. `src/event-endpoint.ts`:
   - `KIND_ANIMATION.compacting` = `"compacting"` (was `"working"`).
   - `compacted` branch: instead of plain cancel, invoke `handleShowAnimation` with the `recovering` preset and a ~60-second auto-cancel timeout. The next inbound operator message / event naturally replaces or cancels it (animation replacement is already the bridge's behavior on new outbound content).
4. Event-endpoint test asserts: governor `compacting` event → `handleShowAnimation({ preset: "compacting" })`; governor `compacted` event → `handleShowAnimation({ preset: "recovering", timeout: ~60 })` (no longer `handleCancelAnimation`).
5. Manual smoke test (run by Curator after merge):
   - POST `kind: "compacting"` → operator sees animated `compacting` frames.
   - POST `kind: "compacted"` → operator sees the `recovering from compaction` animation; it expires after ~60 s or earlier when a new message replaces it.

## Out of scope

- Reworking how `KIND_ANIMATION` is sourced (still hardcoded const map is fine).
- Other kinds (`startup`, `shutdown_*`) — leave their preset mappings untouched.
- Configurable timeout — 60 s is the agreed default; making it tunable is a follow-up if needed.

## Notes

- Discovered 2026-04-25 during operator's smoke test of the v7.2.0 `/event` endpoint. The fanout / agent_event service message and governor-actor animation trigger both work correctly; only the preset choice and the `compacted` side-effect were wrong.
- Operator intent: post-compaction visibility — when an agent compacts, the operator should see "compacting" then "recovering from compaction" so they understand the agent's state instead of staring at a static UI.
