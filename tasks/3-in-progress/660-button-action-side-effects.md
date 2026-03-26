# 660 — Investigate Button Action Side Effects

| Field    | Value                           |
| -------- | ------------------------------- |
| Created  | 2026-03-26                      |
| Priority | medium                          |
| Scope    | Telegram MCP                    |
| Stage    | 2-queued                        |

## Problem

Certain button/callback actions produce unexpected side effects in the Telegram chat UI.
This needs investigation to identify root causes and fix them.

## Observed Symptoms

### 1. Session rename changes message author attribution

When a session rename request is approved (operator taps "Accept"), the message
that contained the rename button appears to change its author — e.g., a message
originally from "Curator" (SID 1) appears to be reattributed to "Worker" (SID 2)
after the button action completes.

**Expected:** The button action confirms the rename; the original message stays
attributed to the session that sent it.

**Actual:** The message author label changes to a different session name after
the callback resolves.

### 2. General button callback attribution issues

Other button actions (confirm, choose) may have similar side effects. This task
should audit the callback handling path for all interactive message types to see
if message editing (updating button text/state) inadvertently changes the session
badge or attribution.

## Investigation Steps

1. Review `rename_session` handler — what happens to the message after the callback?
   Does it call `editMessageText` or `editMessageReplyMarkup`? Does the edit preserve
   the original session badge prefix?

2. Check the session badge injection logic — is the badge (e.g., `🟦 🤖 Curator`)
   injected at send time and preserved on edit? Or is it recalculated on edit using
   the current session state?

3. If the badge is recalculated on edit: the rename has already changed the session
   name by the time the confirmation message is edited, so it picks up the new name.
   But the editor might be a different SID, causing cross-attribution.

4. Check if this also affects `confirm` and `choose` result messages.

5. Look for related GitHub issues.

## Acceptance Criteria

- [ ] Root cause identified for the rename author-swap behavior
- [ ] Fix implemented if the cause is clear
- [ ] Other callback handlers audited for similar issues
- [ ] No regression in existing button functionality
