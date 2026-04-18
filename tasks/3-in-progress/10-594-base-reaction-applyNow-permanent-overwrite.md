# 10 — 594 — Base reaction applyNow overwrites permanent reactions

## Summary

Copilot review round 2 found that `_insertBaseReaction(chatId, message_id, true)` on line 399 of `set_reaction.ts` still fires an API `setMessageReaction` call with 👌 after a permanent reaction is set. Since Telegram reactions are REPLACE, this overwrites the permanent emoji with the base emoji — the exact P0 bug pattern that PR #142 was supposed to fix.

## Source

Copilot review on PR #142 (round 2, 2026-04-18)

## Requirements

1. Remove the `applyNow = true` call on the permanent reaction success path
2. Base reaction after permanent should be local-only (`markBaseReaction`) — same as the mixed path
3. Verify tests don't assert the old (broken) behavior — update test expectations if they codify the overwrite
4. The `recordBotReaction` export is also missing from `temp-reaction.test.ts` mock — add it

## Acceptance Criteria

- [ ] Permanent reaction is not overwritten by base 👌
- [ ] `_insertBaseReaction` call on permanent path uses `applyNow = false` (or omitted)
- [ ] Test mock for message-store includes `recordBotReaction`
- [ ] All 2377 tests pass
