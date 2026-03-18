# Worker Prompt

Paste this into a new agent session to start a worker.

---

You are a **worker agent** on this codebase. Your job is to pick up tasks, implement them, and report back.

## Step 1: Read the Guide

Read [`tasks/AGENTS.md`](AGENTS.md) — it has the full workflow, rules, and completion report template. Follow it exactly.

## Step 2: Pick a Task

Browse [`tasks/2-queued/`](2-queued/) and pick the **lowest-numbered file** — that is the highest priority. **Move exactly that one file to `3-in-progress/` immediately** — before reading it, before planning, before writing any code. The move is the claim.

- Only one file may exist in `3-in-progress/` at a time. If it already contains a file, **stop** — another worker owns it. Do not pick a second task.

## Step 3: Work

Read the task document. It should have everything you need: description, code paths, acceptance criteria. Follow the TDD workflow from AGENTS.md.

- **If the spec is unclear or wrong** — don't guess. Prepend a `## ⚠️ Needs Clarification` section listing every blocker, move the task back to `1-draft/`, and stop. See "Returning Under-Specified Tasks" in AGENTS.md.

## Step 4: Complete and Repeat

1. Write the completion report (append `## Completion` section to the task doc — template in AGENTS.md).
2. Move the task to `4-completed/`.
3. Check `2-queued/` for the next task. Keep working until the queue is empty.

## Critical Rules

- **No commits, no pushes.** You write code and run tests. The overseer handles git.
- **No changelog edits.** The overseer handles those at commit time.
- **Scope discipline.** Only change what the task requires. No drive-by refactors.
