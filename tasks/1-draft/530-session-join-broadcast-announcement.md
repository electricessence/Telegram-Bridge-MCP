# 530 — Session join broadcast announcement

**Priority:** 250 (Medium-High)
**Scope:** `src/tools/session_start.ts`, `src/session-queue.ts`, `src/outbound-proxy.ts`

## Problem

When a session is approved, the approval prompt is private to the operator and gets edited in-place. No visible announcement is sent to the chat, and other sessions only receive internal service messages. There's no way for the operator (or other sessions) to reply-to-address the new session.

## Requirements

1. After approval, **delete** the approval prompt message (it's private UI, not public)
2. **Send a visible broadcast message** styled with the session's name tag (via the outbound proxy), e.g.:
   ```
   🟢 Worker 1
   Online
   ```
   It should look identical to a normal session outbound message — name tag header, same formatting
3. **Track the announcement as owned by the approved session** so that replying to it routes to that session (`trackMessageOwner(msgId, sid)`)
4. **Deliver a service event to all session queues** so every session knows someone joined (existing `deliverServiceMessage` behavior, but now with the broadcast message_id attached)
5. Any session or the operator can **reply to the announcement** to address the new session directly — existing `resolveTargetSession` handles this via `getMessageOwner`

## Acceptance

- Approval prompt is deleted after the operator selects a color
- A name-tagged "Online" message appears in the chat, looking like it came from the session
- Replying to that message routes the reply to the correct session's queue
- All sessions receive a service event about the join
- Denial still works as before (no broadcast on deny)
- Existing tests pass, new test covers the broadcast + reply-to-routing path
