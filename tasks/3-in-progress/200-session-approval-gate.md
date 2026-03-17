# Feature: Session Approval Gate

## Type

Feature / UX

## Description

First session is auto-approved with the default name "Primary". Second and subsequent sessions must be approved by the operator via a Telegram `confirm` button. Name collisions are rejected immediately. The operator can deny a session entirely.

## User Quote

> (from voice — paraphrased) Second session joining should ask the operator for approval. First one is auto-approved as Primary.

## Dependencies

- **100-sid-required-all-tools** — SID enforcement must exist so the new session can't act before approval

## Current State

`src/tools/session_start.ts` currently creates sessions unconditionally:

1. Calls `createSession(name)` in `src/session-manager.ts` (L43)
2. `createSession` increments `_nextId`, stores in `_sessions` Map, returns `{ sid, pin, name, sessionsActive }`
3. No approval gate, no name collision check
4. The intro message is sent to Telegram after creation (not before)

## Code Path

1. `src/tools/session_start.ts` — tool handler, calls `createSession()`, sends intro message
2. `src/session-manager.ts` — `createSession(name?)`, `listSessions()`, `activeSessionCount()`
3. `src/tools/confirm.ts` — operator-facing yes/no button (will be used for approval UX)
4. `src/telegram.ts` — `resolveChat()` for sending the approval prompt to operator

## Design Decisions

### First session flow

1. Agent calls `session_start(name: "Overseer")`
2. `activeSessionCount() === 0` → auto-approve
3. Create session, return SID/PIN immediately
4. Send intro message to Telegram

### Second+ session flow

1. Agent calls `session_start(name: "Scout")`
2. `activeSessionCount() >= 1` → approval required
3. **Before creating the session**, send a `confirm` prompt to the operator:
   - Message: `🤖 New session requesting access: **Scout**`
   - Buttons: `✅ Approve` / `❌ Deny`
4. Block the tool call until operator responds
5. If approved → create session, return SID/PIN
6. If denied → return error: `"Session denied by operator"`

### Name collision handling

- Before creating (or prompting), check `listSessions()` for existing session with same name (case-insensitive)
- If collision → return error immediately: `"Session name 'Scout' is already in use. Choose a different name."`
- No operator prompt needed for collisions — fast fail

### Timeout behavior

- If operator doesn't respond within a reasonable window (e.g., 60 seconds), deny by default
- The requesting agent's tool call returns a timeout error

### What about the "Primary" default name?

- If first session doesn't provide a name, default to "Primary"
- Second+ sessions MUST provide a name (no default)

## Acceptance Criteria

- [ ] First session auto-approved without operator interaction
- [ ] Second+ session blocked until operator `confirm` approves
- [ ] Operator deny → session not created, error returned to agent
- [ ] Name collision → immediate error without operator prompt
- [ ] Name comparison is case-insensitive
- [ ] Timeout (60s) → deny by default
- [ ] First session defaults to name "Primary" if none provided
- [ ] Second+ session requires a name (error if omitted)
- [ ] Tests: first session auto-approval flow
- [ ] Tests: second session approval prompt sent
- [ ] Tests: operator denies → error returned
- [ ] Tests: name collision → immediate error
- [ ] Tests: timeout → deny
- [ ] All tests pass: `pnpm test`
- [ ] No new lint errors: `pnpm lint`
- [ ] Build clean: `pnpm build`

## Work in Progress

**Partial work done — tests written, implementation not started.**

### Test scaffolding added (`src/tools/session_start.test.ts`)

Added mocks and 5 new failing tests covering the approval gate acceptance criteria:

- `activeSessionCount` mock added to the `session-manager.js` mock factory
- `button-helpers.js` mock added: `pollButtonPress`, `ackAndEditSelection`, `editWithSkipped`
- `registerCallbackHook`, `clearCallbackHook` added to `message-store.js` mock
- `pollButtonPress` default mock returns `null` (timeout — no approval)

New tests (all failing — no implementation yet):

1. "first session is auto-approved without operator interaction"
2. "first session defaults name to 'Primary' when none provided"
3. "second session requires operator approval and succeeds on approve"
4. "second session denied by operator → returns error, session not created"
5. "second session timed out → returns error, session not created"
6. "second session without a name → immediate error, no approval prompt"

### Implementation plan (for next worker)

All changes go in `src/tools/session_start.ts`:

1. Import `activeSessionCount` from `../session-manager.js`
2. Import `pollButtonPress`, `ackAndEditSelection`, `editWithSkipped` from `./button-helpers.js`
3. Import `registerCallbackHook`, `clearCallbackHook` from `../message-store.js`
4. Before the name-collision check:
   - `const existingCount = activeSessionCount()`
   - If `existingCount === 0` and no name provided → use `"Primary"` as default
   - If `existingCount >= 1` and no name provided → return `toError({ code: "NAME_REQUIRED", ... })`
5. Replace the name-collision `listSessions()` check: only run it when `existingCount >= 1` (no need for first session)
6. After collision check (when `existingCount >= 1`):
   - Send approval prompt via `getApi().sendMessage(chatId, ...)` with Approve/Deny buttons
   - Register callback hook for button ack: `registerCallbackHook(promptMsgId, ...)`
   - Call `pollButtonPress(chatId, promptMsgId, 60, signal, 0)` — `sid=0` uses global queue
   - On timeout (`null`) → `clearCallbackHook(promptMsgId)`, return `toError({ code: "SESSION_TIMEOUT", ... })`
   - On deny (`data !== "session_approve"`) → `ackAndEditSelection(...)`, return `toError({ code: "SESSION_DENIED", ... })`
   - On approve → `ackAndEditSelection(...)`, continue to `createSession(name)` as normal
7. Error codes: `"SESSION_DENIED"`, `"SESSION_TIMEOUT"`, `"NAME_REQUIRED"`

### Key design detail

The approval prompt is sent **before** `createSession()` is called — the session doesn't exist yet. Use `sid=0` (global queue) for `pollButtonPress` so it polls the main message store, not a per-session queue.

