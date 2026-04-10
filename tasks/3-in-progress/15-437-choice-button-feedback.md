---
Created: 2026-04-09
Status: Complete
Host: local
Priority: 15-437
Source: Operator testing session
---

# Non-Blocking Choice Button Feedback

## Objective

When the operator clicks a button on a non-blocking `type: "choice"` message, all buttons disappear without any visual feedback. The clicked button should be highlighted (or the message collapsed to show the selection), matching the blocking choose behavior.

## Context

- Blocking choose (via `type: "question"`) already works correctly: collapses and shows "→ [selected option]".
- Non-blocking `type: "choice"` (via `handleSendChoice`) just removes the inline keyboard after a callback without editing the message to show what was selected.
- This is 10-432 in backlog (choose button highlight on click) — upgrading to queued with clearer spec after testing confirmed the issue.
- The callback comes through as a `cb` event with `data` matching the `value` from the option.

### Related

- Supersedes 10-432 (backlog) — same issue, better spec.

## Acceptance Criteria

- [x] After clicking a non-blocking choice button, the message is edited to show "▸ *[selected label]*" (same format as blocking choose)
- [x] Remaining buttons are removed from the message
- [x] The callback event is still delivered via dequeue as before
- [x] Blocking choose behavior remains unchanged (already working)
- [x] Existing tests pass; new tests cover non-blocking choice feedback

## Completion

- **Branch:** `15-437`
- **Commit:** `3809057`
- **Files changed:**
  - `src/tools/send_choice.ts` — Added `ackAndEditSelection` import; replaced manual `answerCallbackQuery` + `editMessageReplyMarkup` hook with `ackAndEditSelection(chatId, messageId, text, label, qid)`. Label resolved by matching `evt.content.data` against option values; falls back to raw data value if not found.
  - `src/tools/send_choice.test.ts` — Added `editMessageText` mock; updated two hook tests to assert label-containing text edit; added fallback label test.
  - `src/tools/callback-edge-cases.test.ts` — Updated two `editMessageReplyMarkup` assertions to `editMessageText`.
  - `src/tools/interactive-flows.integration.test.ts` — Updated `editMessageReplyMarkup` assertion to `editMessageText`.
- **Tests:** 2163/2163 passing
- **Code review:** Minor finding — `getApi` was unused after patch; removed from import. Pre-existing `parse_mode` mismatch in `ackAndEditSelection` (shared with `choose`) noted but not in scope.
