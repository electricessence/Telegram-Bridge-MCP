# 040 — Review LOOP-PROMPT.md

**Type:** Investigation (report only — no fixes)
**Priority:** 10

## Objective

Review `LOOP-PROMPT.md` for clarity, completeness, and accuracy. Report findings — do not make changes.

## Context

`LOOP-PROMPT.md` is the canonical loop recipe pasted by users to start a Telegram chat loop. It's referenced by `.github/agents/overseer.agent.md`. The file was last updated around v3.0.0 and may have stale or redundant content now that agent files (`.github/agents/`) carry role-specific instructions.

## Review Checklist

1. **Accuracy** — Do the setup steps match current tool behavior? Any outdated tool names or flows?
2. **Redundancy** — Which sections duplicate content already in `telegram-communication.instructions.md` or the agent files? Flag overlaps.
3. **Completeness** — Is anything missing that a first-time user would need to start a loop?
4. **Conciseness** — Any sections that could be trimmed without losing value?
5. **Instruction Precedence** — Does the precedence list still make sense given the current agent architecture?

## Deliverable

Add a `## Findings` section to this task file with your observations, organized by the checklist items above. Then move this file to `tasks/4-completed/2026-03-20/`.
