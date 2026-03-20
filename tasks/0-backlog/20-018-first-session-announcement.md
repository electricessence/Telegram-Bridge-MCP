# 018 — First Session Announcement

**Priority:** 20  
**Type:** Enhancement  
**Area:** `src/tools/session_start.ts`

## Problem

The first session to connect is auto-approved (no operator approval gate), but it also skips the announcement message. The operator has no visible indication that a session has connected until the agent starts sending messages. This makes it confusing to track which sessions are active, especially after server restarts.

## Requirements

- When `session_start` creates the first session (auto-approved), send a visible announcement message to the chat (e.g. `Session 1 — 🟢 Online`)
- The announcement should follow the same format as the second+ session announcement (after approval)
- The announcement message should be tracked with `trackMessageOwner` so replies route to the session
- Include `announcement_message_id` in the `session_orientation` service event details

## Notes

- Currently, second+ sessions get an announcement after the operator approves via the color-picker keyboard
- The first session should get the same announcement, just without needing approval
- Color assignment for the first session: use the first available color from the palette
