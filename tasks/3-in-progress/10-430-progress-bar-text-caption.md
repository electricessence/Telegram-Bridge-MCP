---
id: 10-430
title: Progress bar text caption not rendering
type: bug
priority: medium
repo: Telegram MCP
branch: 10-430
---

# 10-430: Progress bar `text` param silently ignored

## Problem

When calling `send(type: "progress", text: "Some caption", percent: 50)`, the `text`
param is silently dropped. Progress bars render the bar and percentage only, with no
caption text. The correct param is `title`, but agents and operators naturally use
`text` (the universal send param).

**Reproduction:**
```
send(type: "progress", text: "Running API tests", label: "Building worktree", percent: 30)
```
Result: renders `▓▓▓░░░░░░░  30%` with no caption.

**Root cause:** In `send.ts`, the `case "progress"` handler calls `handleSendNewProgress`
with `title: args.title` and `subtext: args.subtext` only. `args.text` (the general
send text param) is NOT forwarded. So `text` is silently ignored.

**send_new_progress.ts supports:**
- `title` — bold heading above the bar
- `subtext` — italicized detail below the bar

But `send.ts` route only passes `title`, never falling back to `text`.

## Acceptance Criteria

- [ ] `send(type: "progress", text: "...", percent: N)` renders the text as a caption
      above the bar (same as `title`)
- [ ] `title` continues to work as before (explicit `title` takes precedence over `text`)
- [ ] `send(type: "progress", title: "...", text: "...", percent: N)` — `title` wins,
      `text` is ignored (or used as subtext — document the behavior)
- [ ] No regression on `send_new_progress` standalone tool
- [ ] Tests covering the `text` alias fallback for progress
- [ ] Same aliasing applied to `checklist` if `title` is also missing there

## Implementation Notes

Simplest fix: in `send.ts` `case "progress"` block, change:
```typescript
title: args.title,
```
to:
```typescript
title: args.title ?? args.text,
```

Same pattern for `case "checklist"` if applicable.

Also update the `title` param description to mention `text` as an alias:
> "Optional bold heading. For progress/checklist, `text` is accepted as an alias."

## Completion

**Commit:** `e345732` on branch `10-430`

**Changes:**
- `src/tools/send.ts`: progress case `title: args.title ?? args.text`; checklist case same alias; `title` param description updated; pre-existing `chooseButtons` type cast fixed
- `src/tools/close_session.ts`: extracted `handleCloseSession` as named export (pre-existing build error from 20-345 inlining)
- `src/tools/send.test.ts`: added mock for `handleSendNewProgress`; 2 new regression tests for `text` alias (title absent, title takes precedence)

**Build:** Clean (`pnpm build`)
**Tests:** 2162/2162 passing

**Minor findings:** Two pre-existing build errors were fixed as part of this task (build was broken on dev before this branch). Both unrelated to the feature — noted in changes above.

## Reversal Plan

Change is additive (new fallback). Reversal: remove `?? args.text` fallback, redeploy.
No data migration needed.
