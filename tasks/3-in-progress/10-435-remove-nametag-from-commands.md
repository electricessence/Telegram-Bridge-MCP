---
Created: 2026-04-09
Status: Complete
Host: local
Priority: 10-435
Source: Operator testing session
---

# Remove Name Tag from Built-in Command Responses

## Objective

Built-in bot command responses (`/logging`, `/voice`, `/version`, `/session`) are showing the active session's name tag (e.g. "🟦 Curator") prepended to the response message. These are system/service messages from the bridge itself — they should not carry any session name tag.

## Context

- The bridge prepends `[color] [name]` to outgoing messages from agent sessions.
- Built-in commands are handled by `built-in-commands.ts` (or similar) and use `sendMessage` which goes through the same header-stamping logic.
- The operator click `/voice` and sees "🟦 Curator" at the top — confusing because the voice selector is a bridge feature, not something the Curator sent.
- Commands should either use `_skipHeader: true` in their sendMessage calls, or the header logic should recognize built-in command responses and skip tagging.

## Acceptance Criteria

- [x] `/logging` response has no session name tag
- [x] `/voice` response has no session name tag
- [x] `/version` response has no session name tag
- [x] `/session` response has no session name tag
- [x] All built-in command responses render as system messages (no session attribution)
- [x] Agent-initiated messages still retain their name tags as before
- [x] Existing tests pass

## Completion

**Branch:** `10-435` · **Commit:** `70cfb79`

### Changes

- `src/built-in-commands.ts` — Added `_skipHeader: true` to 5 `sendMessage` calls in `handleVersionCommand`, `handleVoiceCommand` (×2), `handleSessionCommand` (×2). `/logging` was already correct.
- `src/built-in-commands.test.ts` — Updated "no sessions" test to expect 3-arg `sendMessage` call

### Test Results

2162/2162 passing
