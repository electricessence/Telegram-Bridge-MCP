# Remove dump_session_record.ts orphan (surfaced by 40-475)

## Context

Task 10-361 (remove-session-record-feature) was completed and the branch
deleted, but the branch was never merged to dev. PR #126 modified
`dump_session_record.ts` and its test instead of deleting them. As a result,
`src/tools/dump_session_record.ts` and `src/tools/dump_session_record.test.ts`
still exist on dev.

Surfaced during 40-475 reconciliation (2026-04-24).

## Decision Needed

Should `dump_session_record.ts` and its test be removed now (post-v6)?

- If yes: re-queue as a code-removal task; straightforward delete + test cleanup.
- If no: close this draft with a note explaining why the file stays.

## Acceptance Criteria (if queued)

- [ ] `src/tools/dump_session_record.ts` deleted
- [ ] `src/tools/dump_session_record.test.ts` deleted
- [ ] Any imports/registrations of `dump_session_record` removed from `server.ts`
- [ ] Build and all tests pass
