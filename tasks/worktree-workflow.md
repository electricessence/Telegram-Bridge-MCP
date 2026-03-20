# Worktree Workflow

Workers use **git worktrees** to isolate code changes from the main workspace. This prevents workers from interfering with the governor, other workers, or any active PR on the dev branch.

## Lifecycle

```text
governor assigns task (with worktree directive)
  → worker creates branch + worktree
  → worker does all work inside worktree
  → worker commits, tests, pushes in worktree
  → worker reports completion to governor via DM
  → governor verifies (reviews diff, runs tests)
  → governor merges branch into dev branch
  → governor removes worktree + deletes branch
  → governor archives task
```

## Worktree Location

All worktrees live under `.git/.wt/` — hidden inside the git directory, keeping the workspace root clean.

Worktree directories use the full task slug from the task filename:

```
.git/.wt/
  10-013-worktree-test-run/    ← matches task file 10-013-worktree-test-run.md
  20-014-readme-overhaul/      ← matches task file 20-014-readme-overhaul.md
```

## Worker Steps

### 1. Create branch and worktree

When the task spec includes a worktree directive, use the full task slug:

```bash
# Example: task file is 10-013-worktree-test-run.md
git branch task/013-worktree-test-run
git worktree add .git/.wt/10-013-worktree-test-run task/013-worktree-test-run
```

### 2. Work inside the worktree

All file operations happen inside the worktree directory. Never modify files in the main workspace directory.

```bash
cd .git/.wt/10-013-worktree-test-run
# edit files, run tests, etc.
```

### 3. Commit and push

Workers can commit freely within their worktree branch:

```bash
cd .git/.wt/10-013-worktree-test-run
git add -A
git commit -m "feat: description of change"
git push -u origin task/013-worktree-test-run
```

### 4. Report completion

DM the governor: "Task 013 complete. Branch `task/013-worktree-test-run`, worktree at `.git/.wt/10-013-worktree-test-run`. Tests passing."

**Do not** move task files or touch the task board. The governor handles that.

## Governor Steps

### 1. Create task with worktree directive

Include in the task spec:

```markdown
## Worktree

Create worktree `10-013-worktree-test-run` from the current dev branch.
Branch: `task/013-worktree-test-run`
```

### 2. Verify worker's output

```bash
cd .git/.wt/10-013-worktree-test-run
pnpm test
pnpm lint
git log --oneline -5
git diff main..task/013-worktree-test-run --stat
```

### 3. Merge

The governor picks the merge strategy per task:

**Direct merge** — for low-risk changes (docs, configs, small fixes):
```bash
# From the main workspace
git merge task/013-worktree-test-run
```

**PR-based merge** — for features and anything that changes runtime behavior:
```bash
# Worker pushes to origin; governor creates a PR
# PR gets CI, Copilot review, and operator review before merging
```

Use PR-based merge when:
- The change modifies source code (`src/`)
- The feature is large or complex
- You want CI validation before merging
- The operator wants a review checkpoint

Or create a PR if the change warrants review.

### 4. Cleanup

```bash
git worktree remove .git/.wt/10-013-worktree-test-run
git push origin --delete task/013-worktree-test-run
```

Local branch deletion (`git branch -d`) may be policy-blocked in automated sessions. This is fine — stale local branches are harmless refs. The operator can clean them up periodically with `git branch --merged | xargs git branch -d`.

Then archive the task file.

## When to Use Worktrees

**Not every task needs a worktree.** Simple edits (README, docs, configs) should be done directly in the main workspace — no branch, no worktree. Worktrees are for code changes that could break the build or conflict with other work.

The governor decides per-task and specifies it in the task spec:

| Task type | Worktree? |
| --- | --- |
| Source code (features, fixes, refactors) | **Yes** |
| Large multi-file documentation overhauls | Governor's discretion |
| Single-file doc edits (README, changelog) | **No** — edit in place |
| Config/task board changes | **No** |
| Research / investigation | **No** |

**If the task spec doesn't include a `## Worktree` section, work directly in the main workspace.**

## Rules

- Workers **must not** modify files in the main workspace when operating in a worktree.
- Workers **can** create branches and worktrees when directed by the task spec.
- Workers **can** commit and push freely within their worktree branch.
- Workers **must not** merge their branch — the governor does that.
- Workers **must not** touch task files — the governor manages the task board.
- If tests fail in the worktree, report the failure to the governor. Do not merge broken code.
