---
Created: 2026-04-09
Status: Queued
Host: local
Priority: 10-427
Source: Dogfood test 10-404, rows 7 + 17
---

# MarkdownV2 rendering broken on edit and inconsistent on send

## Objective

Fix MarkdownV2 rendering across send and edit operations. Currently
`parse_mode: "MarkdownV2"` doesn't consistently render formatted text.

## Context

Dogfood findings:
- **Row 7 (send):** `*bold*` in MarkdownV2 mode didn't render visually on send.
  Note: Telegram MarkdownV2 uses single `*` for bold, not `**`. The server may
  need to document this or auto-convert.
- **Row 17 (edit):** Both `*bold*` and `_italic_` with MarkdownV2 parse_mode
  didn't render on `message/edit`.
- **Row 30 (cancel):** HTML parse_mode on animation cancel works correctly —
  so the issue is MarkdownV2-specific, not parse_mode in general.

Telegram MarkdownV2 requires escaping special characters outside format entities.
The server may need to auto-escape or clearly document the required format.

## Acceptance Criteria

- [ ] `send(text: "*bold*", parse_mode: "MarkdownV2")` renders bold text
- [ ] `action(type: "message/edit", text: "*bold*", parse_mode: "MarkdownV2")` renders bold
- [ ] Either auto-escape special chars or document MarkdownV2 syntax in help
- [ ] Test: send and edit with bold, italic, code, links in MarkdownV2

## Completion

Root cause: `action.ts` `parse_mode` schema used `.optional()` without `.default('Markdown')`, meaning `action(type: 'message/edit')` calls without explicit parse_mode routed to Telegram with no parse_mode — plain text. The standalone `edit_message` tool had `.default('Markdown')` but the action path did not. Fix: added `.default('Markdown')` and improved the parse_mode description to clarify MarkdownV2 = raw pass-through. Two regression tests added verifying: (1) omitting parse_mode yields 'Markdown' default, (2) explicit 'MarkdownV2' passes through unchanged. All 2131 tests pass. Branch: `10-427`, commit: `822cff1`.
