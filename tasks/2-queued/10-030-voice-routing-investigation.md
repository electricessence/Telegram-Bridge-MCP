# Task #030 — Investigate Voice Reply Routing to Worker Sessions

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Priority | 10 (investigation — diagnostic only)              |
| Created  | 2026-03-20                                        |
| Type     | **Investigation** — report findings, do not fix   |

## Problem

When the operator replies (voice or text) to a message sent by a worker session (SID 2), the reply is not routed to the worker's queue. Instead it falls through to the governor (SID 1).

## Evidence

Debug routing log from live session shows **1 of 183 routing decisions** reached worker SID 2:
- `"targeted event=11373 → sid=2"` — text reply to worker's announcement message (11372)
- Every other message → SID 1

Worker SID 2 sent only two messages in the session: announcement (11372) and a rename prompt (11375). The text reply to 11372 routed correctly, suggesting ownership tracking works for at least some messages.

## Investigation Scope

### 1. Ownership tracking coverage

In `src/message-store.ts`, `recordOutgoing()` calls `trackMessageOwner(messageId, activeSid)` at line ~465 using `sid ?? getCallerSid()`.

- **Question:** Are there outbound paths that bypass `recordOutgoing()`? (direct `bot.sendMessage` calls, outbound proxy shortcuts, etc.)
- **Question:** Does `getCallerSid()` return the correct SID for worker tool calls? Trace the `callerSid` lifecycle.

### 2. Reply-to resolution

In `src/session-queue.ts`, `resolveTargetSession()` checks `event.content.reply_to` → `getMessageOwner(reply_to)`.

- **Question:** Is `reply_to` populated correctly for voice messages? Check the update sanitizer (`src/update-sanitizer.ts`) to see if `reply_to_message.message_id` is extracted for voice updates.
- **Question:** Could `reply_to` be set to the *user's* message ID instead of the bot's message ID? If so, ownership lookup would miss.

### 3. Confirm/choose button messages

Confirm and choose tools generate inline-keyboard messages. When workers use these tools:

- **Question:** Is the resulting bot message tracked with the worker's SID?
- **Question:** Do callback responses route back via `event.content.target`?

### 4. Edited messages

If a bot message is edited (e.g., progress updates, checklist updates), does the *edited* message retain ownership? `recordOutgoingEdit()` doesn't call `trackMessageOwner()`.

## Deliverables

1. A written analysis answering each question above with code references
2. Identification of which outbound paths (if any) fail to call `trackMessageOwner()`
3. Reproduction steps: a minimal scenario where a worker-sent message is not ownership-tracked
4. Append findings to this task file under `## Findings`

## Files to Read

- `src/session-queue.ts` — routing logic, `trackMessageOwner`, `resolveTargetSession`
- `src/message-store.ts` — `recordOutgoing`, `recordOutgoingEdit`, `getCallerSid`
- `src/outbound-proxy.ts` — outbound recording, proxy layer
- `src/update-sanitizer.ts` — inbound `reply_to` extraction
- `src/tools/` — confirm, choose, send_message tools (check SID propagation)
- `src/routing-mode.ts` — governor SID management
