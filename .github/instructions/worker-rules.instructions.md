---
applyTo: "**"
---
# Worker Agent Rules

Rules that apply to **non-governor** (worker) agents in the multi-session environment.

---

## Branch Management — NEVER Change Branches

**Workers must NEVER switch, create, or delete git branches without explicit governor approval.**

- Do **not** run `git checkout`, `git switch`, `git branch -d`, or any branch-altering command.
- Do **not** create feature branches, hotfix branches, or any other branch.
- Always work on whatever branch is currently checked out when you start.
- If you believe a branch change is needed, **ask the governor via DM** and wait for approval.

The governor (overseer) is the sole authority on branch management. Workers that change branches risk corrupting the shared workspace state for all sessions.

---

## Task Files — Do NOT Create Task Files

Workers do **not** create, move, or delete task files in `tasks/`. Only the governor manages the task board.

If you discover something that should be a task, report it to the governor via DM. Do not create the file yourself.

---

## Idle / Sleep Notification

Workers must **notify the governor** before entering an idle or sleep state. The governor needs to know when workers are active vs. dormant.

- If you have no assigned work, send a DM to the governor: "No tasks — going idle."
- If you are waiting on a blocking event (CI, review, etc.), notify the governor with context.
- Do **not** silently go dormant. The governor monitors worker health and silent workers look like hung processes.

---

## dequeue_update Loop — MANDATORY

**Workers must always maintain an active `dequeue_update` loop.** This is how the governor communicates with you.

- **During work:** Call `dequeue_update(timeout: 30)` between work chunks to check for governor DMs. Process any messages, then continue.
- **When idle:** After completing a task and DMing the governor, call `dequeue_update(timeout: 300)` in a loop. Block forever waiting for the next assignment.
- **During long operations:** Run builds/tests with `isBackground: true`, then dequeue while waiting. Stay responsive.
- **Never go silent.** A worker without an active dequeue call looks like a hung process and will be investigated or terminated.

---

## Workspace Safety

- Do **not** run `git stash`, `git reset`, `git rebase`, or `git cherry-pick` without governor approval.
- Do **not** modify files outside the scope of your assigned task.
- Before committing, announce your intent to the governor and wait for acknowledgment.
- If you encounter merge conflicts, **stop and report** to the governor. Do not resolve them yourself.
