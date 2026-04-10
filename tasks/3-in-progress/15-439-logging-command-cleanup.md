---
Created: 2026-04-09
Status: Complete
Host: local
Priority: 15-439
Source: Operator testing session
---

# /logging and /log Command Cleanup

## Objective

There are two overlapping commands: `/log` and `/logging`. Only one should exist. Additionally, the `/logging` menu has confusing button labels ("Dump", "Flush") that are developer jargon, not user-friendly.

## Context

- `/logging` opens a menu with session log mode toggles and action buttons.
- `/log` apparently still exists separately — redundant.
- "Dump" and "Flush" are internal operations that mean nothing to an operator.
- Buttons need clearer labels: e.g. "Save Log", "Export Session", "Clear Buffer" — whatever maps to the actual behavior.
- Not enough room for all buttons in the current layout.

## Acceptance Criteria

- [x] Only one logging command exists — `/logging` is the canonical command
- [x] `/log` routes to the same `/logging` handler (alias, not a separate panel)
- [x] "Dump" button renamed to "💾 Save log"
- [x] "Flush (N)" button renamed to "🗑 Clear (N)" (or "🗑 Clear" when empty)
- [x] Button layout split into 2×2 rows for better mobile fit
- [x] Existing tests pass; `/log` test updated; BUILT_IN_COMMANDS test updated

## Completion

- **Branch:** `15-439`
- **Commit:** `9ed549d`
- **Files changed:**
  - `src/built-in-commands.ts` — Removed `log` from `BUILT_IN_COMMANDS`; routed `/log` dispatcher to `handleLoggingCommand`; renamed `"Dump"` → `"💾 Save log"` and `"Flush (N)"` → `"🗑 Clear (N)"` in `buildLoggingPanel`; split ON-state keyboard into 2×2 rows.
  - `src/built-in-commands.test.ts` — Removed `log` entry from metadata test; replaced 3 `/log` command tests with single alias routing test.
- **Tests:** 2164/2164 passing
