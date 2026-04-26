---
id: 15-0837
title: Event endpoint — wire compacting kind to compacting preset (not working)
priority: 15
status: draft
type: fix
delegation: any
---

# Event endpoint — wire `compacting` kind to `compacting` preset

`POST /event` with `kind: "compacting"` from the governor currently triggers the `working` preset. It should trigger the `compacting` preset, which already exists in `BUILTIN_PRESETS`.

## Current state

- `src/event-endpoint.ts` `KIND_ANIMATION` map: `compacting: "working"`
- `src/animation-state.ts` `BUILTIN_PRESETS`: `compacting` exists as a single-frame preset: `["👨‍💻 compacting..."]`

## Acceptance criteria

1. `src/event-endpoint.ts` `KIND_ANIMATION.compacting` = `"compacting"` (was `"working"`).
2. The `compacting` built-in preset has at least 4 frames so it visibly animates (single-frame is static). Suggested style: matches the `working`/`thinking`/`loading` family — a moving dot/center pattern around the word `compacting`. Keep the developer emoji or drop it; designer's call.
3. Test coverage: an event-endpoint test (`src/event-endpoint.test.ts` or similar) asserts that a governor `compacting` event invokes `handleShowAnimation` with `preset: "compacting"`.
4. Manual smoke test: governor POSTs `compacting` → operator sees the new compacting animation; POSTs `compacted` → animation cancels.

## Out of scope

- Reworking how `KIND_ANIMATION` is sourced (still hardcoded const map is fine).
- Other kinds (`startup` etc.) — leave their preset mappings untouched.

## Notes

- Discovered 2026-04-25 during operator's smoke test of the v7.2.0 `/event` endpoint. The fanout / agent_event service message and governor-actor animation trigger both work correctly; only the preset name was wrong.
