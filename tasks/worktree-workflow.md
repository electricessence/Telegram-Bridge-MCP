# Task Workflow

How the governor assigns work and how workers execute it.

## Three Assignment Modes

The governor picks one per task and specifies it in the task spec:

| Mode | When to use | Task spec includes |
| --- | --- | --- |
| **Direct edit** | Simple changes (single-file docs, configs) | No `## Worktree` section |
| **Worktree** | Code changes, multi-file features, anything that could break the build | `## Worktree` section with branch + directory |

The merge strategy (direct merge vs PR) is the **governor's decision after the worker reports completion**. Workers don't need to know or care how the merge happens.

---

## Worker Responsibilities

Workers do the work. They don't merge branches or decide the merge strategy. They DO move their own task file through the pipeline.

### Direct Edit Tasks

If the task spec has no `## Worktree` section:
1. Move task file from `2-queued/` to `3-in-progress/`
2. Edit files directly in the main workspace
3. Commit and push
4. Move task file from `3-in-progress/` to `4-completed/`
5. DM the governor: done

### Worktree Tasks

If the task spec has a `## Worktree` section:

#### 1. Pick up the task

Move the task file from `2-queued/` to `3-in-progress/` (in the main workspace).

#### 2. Create branch and worktree

Use the slug from the task spec:

```bash
git branch task/013-worktree-test-run
git worktree add .git/.wt/10-013-worktree-test-run task/013-worktree-test-run
```

All worktrees live under `.git/.wt/` — hidden inside the git directory, keeping the workspace root clean.

#### 3. Work inside the worktree

All code edits happen inside the worktree. The only main workspace change is task file movement.

```bash
cd .git/.wt/10-013-worktree-test-run
# edit files, run tests, etc.
```

#### 4. Commit and push

```bash
git add -A
git commit -m "feat: description of change"
git push -u origin task/013-worktree-test-run
```

#### 5. Report completion

Move the task file from `3-in-progress/` to `4-completed/` (in the main workspace).
DM the governor: "Task 013 complete. Branch `task/013-worktree-test-run`. Tests passing."

**Stop here.** Do not merge, delete branches, or remove worktrees. The governor handles everything after this point.

---

## Governor Responsibilities

The governor manages task assignment, merge strategy, and cleanup. Workers never need to know how their branch gets merged.

### Task Assignment

Decide per-task whether it needs a worktree:

| Task type | Worktree? |
| --- | --- |
| Source code (features, fixes, refactors) | **Yes** |
| Multi-file doc overhauls | Governor's discretion |
| Single-file edits (README, changelog, config) | **No** — direct edit |
| Task board changes | **No** |

For worktree tasks, include in the task spec:

```markdown
## Worktree

Create worktree `10-013-worktree-test-run` from the current dev branch.
Branch: `task/013-worktree-test-run`
```

### Merge Strategy

After a worker reports completion, the governor picks one:

**Direct merge** — low-risk changes (docs, small fixes, config):
```bash
git merge --no-ff task/013-worktree-test-run
```

**PR-based merge** — features, runtime changes, anything needing review:
```bash
# Create PR from task/013-worktree-test-run → dev branch
# CI runs, Copilot reviews, operator approves
```

Use PR-based merge when:
- The change modifies source code (`src/`)
- The feature is large or complex
- You want CI validation before merging
- The operator wants a review checkpoint

### Verification

Before merging (either strategy):

```bash
cd .git/.wt/10-013-worktree-test-run
pnpm test
pnpm lint
git log --oneline -5
git diff v4-multi-session..task/013-worktree-test-run --stat
```

### Cleanup

After the branch is merged:

```bash
git worktree remove .git/.wt/10-013-worktree-test-run
git push origin --delete task/013-worktree-test-run
```

Local branch deletion (`git branch -d`) may be policy-blocked in automated sessions. Stale local branches are harmless — the operator can clean them up periodically.

Then archive the task file.

## Rules

- Workers **must not** modify files in the main workspace when operating in a worktree.
- Workers **can** create branches and worktrees when directed by the task spec.
- Workers **can** commit and push freely within their worktree branch.
- Workers **must not** merge their branch — the governor does that.
- Workers **must not** touch task files — the governor manages the task board.
- If tests fail in the worktree, report the failure to the governor. Do not merge broken code.
