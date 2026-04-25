# Draft: Extract SESSION_JOINED_FELLOW to service-messages.ts

**Surfaced by:** Task 25-074 code review (pre-existing inconsistency)

## Context

`handleSessionStart` in `src/tools/session_start.ts` (lines ~375-379) sends a hardcoded
inline string for non-governor fellow notifications:

```
${effectiveName} (SID ${session.sid}) joined. Ambiguous messages go to ${governorLabel}.
```

The governor path for the same loop correctly uses `SERVICE_MESSAGES.SESSION_JOINED`.
This creates a silent divergence: if the canonical `SESSION_JOINED` text is ever updated,
the non-governor path will not follow.

## Proposed Fix

1. Add `SESSION_JOINED_FELLOW` (or `SESSION_JOINED_NON_GOVERNOR`) entry to
   `src/service-messages.ts` with a dynamic text function.
2. Replace the hardcoded string in `session_start.ts:375-379` with
   `SERVICE_MESSAGES.SESSION_JOINED_FELLOW.text(effectiveName, session.sid, governorLabel)`.
3. Update tests.

## Priority

Low — cosmetic consistency. No functional impact.
