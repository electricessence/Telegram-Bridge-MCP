# Ensure PIN Uniqueness Across Live Sessions

**Type:** Hardening
**Priority:** 120 (High)

## Description

When generating PINs for new sessions, verify the generated PIN is not already in use by another live session. A collision would allow one session's agent to authenticate as another.

## Current Behavior

- `createSession()` generates a random PIN
- No check against existing live session PINs
- Collision is statistically unlikely (6-digit PIN, few sessions) but not impossible

## Desired Behavior

- After generating a PIN, check it against all active sessions
- If collision detected, regenerate
- Loop until unique (with a safety cap to avoid infinite loops)

## Code Path

- `src/session-manager.ts` — `createSession()`, PIN generation logic

## Acceptance Criteria

- [x] PIN generation checks against all live session PINs
- [x] Collision triggers regeneration
- [x] Safety cap prevents infinite loop (max 10 attempts, then throws)
- [x] Test: mock a collision scenario, verify regeneration; mock all-collide, verify throws
- [x] Build passes, lint clean, all tests pass
- [x] `changelog/unreleased.md` updated

## Completion

Implemented 2026-03-18.

- `generateUniquePin()` added to `src/session-manager.ts` — collects live PINs into a Set, loops `generatePin()` until unique (max 10 attempts)
- `createSession()` now calls `generateUniquePin()` instead of `generatePin()`
- `src/session-manager.test.ts` updated: `vi.hoisted` + `vi.mock("node:crypto")` pattern for controllable randomInt; 2 new tests (collision regeneration, exhaustion throws)
- 1456 tests pass; build and lint clean
