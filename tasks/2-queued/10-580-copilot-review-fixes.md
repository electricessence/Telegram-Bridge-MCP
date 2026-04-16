---
Created: 2026-04-16
Status: Queued
Target: telegram-mcp-bridge
---

# 10-580 — Fix Copilot Review Issues on PR #136

## Context

Copilot exhaustion run identified 8 real issues across PR #136 (dev → main). These are doc/code mismatches and missing error codes — all fixable on the dev branch.

## Issues

1. **action-registry.ts:9** — `ActionHandler` return type `unknown` too narrow, forces `as unknown as ActionHandler` casts. Widen to `unknown | Promise<unknown>`.

2. **docs/help/profile/load.md:15** — docs show `applied` field that doesn't exist; `summary` and `instruction` undocumented. Update to match actual response shape.

3. **docs/help/approve.md:29** — docs show `target_name` param but implementation requires `ticket`. Update to ticket-based API.

4. **docs/help/session/list.md** (×2) — token documented as required but handler supports unauthenticated probe. Document both modes.

5. **identity-schema.ts:10** — `TOKEN_PARAM_DESCRIPTION` says "Always required" — false given unauthenticated `session/list`. Add caveat or make tool-specific.

6. **approve_agent.ts:55** — `NOT_PENDING` and `INVALID_COLOR` error codes not in `TelegramErrorCode` union in telegram.ts. Add them.

7. **docs/help/message/history.md:18** — no-args example routes to `handleGetChat` (approval dialog), not history. Add `count` to example.

## Acceptance Criteria

- [ ] All 7 distinct issues fixed
- [ ] Tests pass, build clean
- [ ] No new lint warnings
