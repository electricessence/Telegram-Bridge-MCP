# 05 — 591 — Base Reaction Overwrites Temporary Reactions

## Priority: P0 — visible UX bug, reactions disappear

## Summary

The implicit base reaction (👌 at -100) overwrites active temporary
reactions because Telegram's `setMessageReaction` is a REPLACE operation,
not additive. Temporary reactions disappear immediately after being set.

## Root Cause

In `src/tools/set_reaction.ts`, `_insertBaseReaction()` fires
asynchronously after a temporary reaction is set. The sequence:

1. Temp reaction set: `setMessageReaction([🤔])` — shows 🤔
2. Base fires async: `setMessageReaction([👌])` — REPLACES 🤔 with 👌
3. Temp timeout fires: removes 🤔 → sets `[]` — message goes bare

Every `setMessageReaction` call sends the FULL reaction list, not a
diff. The base call doesn't know about the active temporary.

## Fix

The base insertion must be coordination-aware. Options:

**Option A (recommended):** Defer base insertion. Don't fire the base
API call immediately — only insert it when the last temporary reaction
expires. The temp-reaction cleanup code should set `[👌]` instead of
`[]` when clearing the last temporary.

**Option B:** Combine reactions in API calls. When setting any reaction,
always include the base in the array: `setMessageReaction([🤔, 👌])`.
But Telegram only supports ONE reaction per bot — so this won't work.

**Option C:** Track base state locally only. Don't make an API call for
the base. Instead, when the temp-reaction cleanup fires and needs to
restore, it checks the local base state and sets `[👌]` if a base was
registered. The base never hits the API on its own.

Option C is cleanest — no race condition, no extra API calls, base is
just a local state flag that the cleanup code uses as the restore target.

## Acceptance Criteria

- [ ] Temporary reaction stays visible for its full timeout duration
- [ ] After temporary expires, base reaction (👌) appears
- [ ] No intermediate flash of 👌 during temporary period
- [ ] Multiple temporary reactions in sequence work correctly
- [ ] Processing preset (👀→🤔) works without base interference
- [ ] All existing reaction tests pass + new test for this scenario

## Files to Change

- `src/tools/set_reaction.ts` — `_insertBaseReaction()` logic
- `src/temp-reaction.ts` — cleanup/restore logic
- `src/tools/set_reaction.test.ts` — new test case

## Delegation

Worker task. P0 priority — file immediately.
