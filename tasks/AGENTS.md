# Agent Task Guide

Instructions for any agent (sub-agent or human-launched) picking up a task from this system.

## How It Works (Kanban)

Tasks flow through four stages: `1-draft` → `2-queued` → `3-in-progress` → `4-completed`.

- **The overseer** writes task documents and places them in `1-draft` or `2-queued`.
- **Worker agents** browse `2-queued`, pick a task, move it to `3-in-progress`, and take ownership.
- Once a task is in `3-in-progress`, the owning agent has exclusive control over it.
- When done, the owning agent **updates the task document** with a completion report and moves it to `4-completed`.
- The overseer or human reviews the completed task. If approved, it's moved into a dated subfolder (e.g., `4-completed/2026-03-17/`) to archive it.

## Moving Task Files

> **MOVE means MOVE — never copy.** The source file must not exist after the operation. A file in two folders at once breaks the entire kanban system.

Use one of these methods:

```bash
# Preferred — preserves git history:
git mv tasks/2-queued/my-task.md tasks/3-in-progress/my-task.md

# Also acceptable — rename via filesystem then delete source:
mv tasks/2-queued/my-task.md tasks/3-in-progress/my-task.md
```

**Never** use `create_file` to write a copy of a task into a new folder. **Never** read a file's content and write it to a new location. If you're worried about data loss, stage the file with `git add` before moving — but the source file must be gone after the move.

This applies to ALL task transitions: `2-queued → 3-in-progress`, `3-in-progress → 4-completed`.

## Picking Up a Task

> **Step 1 is non-negotiable.** You MUST move the file before doing anything else — reading, planning, or coding. The move IS the claim. Without it, another agent may pick the same task.

1. Browse `2-queued/` — pick the **lowest-numbered file** (lowest number = highest priority). Only **one task at a time** may live in `3-in-progress/`.
1. **Move that one file** (see "Moving Task Files" above) from `2-queued/` to `3-in-progress/` **immediately** — this is your very first action. No reading, no planning, no code changes until the file is moved. Never move more than one file at once.
1. Read the task document thoroughly — it contains the description, context, and acceptance criteria.
1. Understand the codebase context before making changes. Use the existing test files and docs as reference.
1. **Never guess.** If the task document is unclear, move it back to `1-draft/` with a clarification section (see "Returning Under-Specified Tasks").

## Workflow

1. **Claim** — move the task file to `3-in-progress/` (must be your first action).
1. **Write tests first** (TDD) — every change must have tests that fail before the fix and pass after.
1. **Implement** the fix or feature.
1. **Verify** — run all three checks, all must pass:
   - `pnpm test` — all tests pass, no exceptions
   - `pnpm lint` — zero errors
   - `pnpm build` — compiles clean
1. **Write the completion report** — append a `## Completion` section to the task document (see template below). This is mandatory — a task without a completion report is not done.
1. **Move the task** to `4-completed/` — use `git mv` or filesystem move. **Never copy.** The file must no longer exist in `3-in-progress/` after this step.
1. **Report results** to the overseer — what changed, test count, any concerns. Do not move the task silently.
1. **Pick up the next task** — go back to `2-queued/` and repeat from step 1. Do not stop after one task. Keep working until the queue is empty.

## Completion Report

Before moving a task to `4-completed/`, **append a `## Completion` section** to the task document:

```markdown
## Completion

**Agent:** [your session name]
**Date:** YYYY-MM-DD

### What Changed
- List of files modified and what was done

### Test Results
- Tests added: X new tests
- Total tests: Y (all passing)
- Coverage notes (if relevant)

### Findings
- Any bugs discovered, edge cases noted, or concerns raised
- Items that may need follow-up

### Acceptance Criteria Status
- [x] Criterion 1
- [x] Criterion 2
- [ ] Criterion 3 (explain why not met, if any)
```

This is mandatory. A task moved to `4-completed/` without a completion report is incomplete and will be sent back.

## Returning Under-Specified Tasks

If a task document is **unclear, contradictory, references wrong file paths, contains open design questions instead of concrete specs, or lacks the setup mechanics needed to write the test** — do NOT guess. Return it to draft:

1. Prepend a `## ⚠️ Needs Clarification Before Implementation` section listing every specific blocker (wrong paths, missing expected values, ambiguous scenarios, undefined setup steps).
2. Move the task back to `1-draft/` using `git mv tasks/3-in-progress/my-task.md tasks/1-draft/my-task.md`.
3. Report the rejection and your specific questions to the overseer.

This is not a failure — it's quality control. A well-specified task should be implementable without guessing. If it isn't, send it back.

## Rules

- **Claim first, always.** The file move to `3-in-progress/` must precede all other work — no exceptions.
- **One task at a time.** Only one task file may be in `3-in-progress/` at once. The file name prefix determines priority — pick the lowest number. Do not move additional tasks until the current one is complete and moved to `4-completed/`.
- **Move, never copy.** Task files must exist in exactly one folder at all times. Use `git mv` or filesystem rename — never read+create. If a file appears in two folders, the kanban is broken.
- **No commits or pushes.** Only the overseer commits. You write code and run tests.
- **No changelog edits.** The overseer handles changelog entries at commit time.
- **In-progress = owned.** Once you move a task to `3-in-progress`, it's yours. No one else touches it. If you need to escalate, report back — don't abandon it silently.
- **Completion report is mandatory.** Never move a task to `4-completed/` without a `## Completion` section. If you forget, the overseer will reject it.
- **Report before moving.** Tell the overseer you're done before moving to `4-completed/`. The move is the last step, not a silent one.
- **Scope discipline.** Only change what the task requires. No drive-by refactors, no extra features.
- **If tests break, stop.** Don't push through broken tests. Fix or escalate.

## Codebase Quick Reference

- **Language:** TypeScript, ESM, Node 22+
- **Test framework:** Vitest
- **Package manager:** pnpm
- **Source:** `src/` — the MCP server
- **Tools:** `src/tools/` — individual MCP tool implementations
- **Tests:** co-located with source (e.g. `foo.ts` → `foo.test.ts`)
- **Build:** `pnpm build` (tsc → `dist/`)
- **Test:** `pnpm test` (vitest)
- **Lint:** `pnpm lint` (eslint)

## Task Document Structure

Each task `.md` file should contain:

- **Type** — Bug, Feature, Testing, etc.
- **Description** — What needs to happen
- **Observed/Expected Behavior** (for bugs)
- **Code Path** — Relevant files and functions
- **Investigation** — What's been tried so far
- **Next Steps** — Specific actionable items
- **Acceptance Criteria** — How to know it's done
