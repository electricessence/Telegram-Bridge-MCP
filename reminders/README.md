# Reminders

This folder contains procedure docs for recurring governor reminders. When a reminder fires, the agent reads the corresponding doc and executes the procedure described.

## Governor Startup Reminders

On session start, the governor should create these recurring reminders using `set_reminder`:

| # | File | Reminder Text | Delay (s) | Recurring |
|---|------|--------------|-----------|-----------|
| 1 | [01-task-board-hygiene.md](01-task-board-hygiene.md) | 📋 Task board hygiene | 900 (15 min) | Yes |
| 2 | [02-git-state-audit.md](02-git-state-audit.md) | 🔍 Git state audit | 600 (10 min) | Yes |
| 3 | [03-build-lint-health.md](03-build-lint-health.md) | 🔨 Build & lint health | 1200 (20 min) | Yes |
| 4 | [04-test-suite-health.md](04-test-suite-health.md) | 🧪 Test suite health | 1800 (30 min) | Yes |
| 5 | [05-changelog-review.md](05-changelog-review.md) | 📝 Changelog review | 3600 (60 min) | Yes |
| 6 | [06-doc-hygiene.md](06-doc-hygiene.md) | 📚 Doc hygiene | 3600 (60 min) | Yes |
| 7 | [07-operator-check-in.md](07-operator-check-in.md) | 👤 Operator check-in | 600 (10 min) | Yes |
| 8 | [08-pr-review-exhaustion.md](08-pr-review-exhaustion.md) | 🔄 PR review exhaustion | 600 (10 min) | Yes |
| 9 | [09-pr-health-check.md](09-pr-health-check.md) | 🔀 PR health check | 1800 (30 min) | Yes |

## Worker Startup Reminders

On session start, workers should create these recurring reminders:

| # | Reminder Text | Delay (s) | Recurring | Action |
|---|--------------|-----------|-----------|--------|
| 1 | Check the queue | 300 (5 min) | Yes | Look at `tasks/2-queued/` for unassigned tasks. If found, pick one up and DM the governor. |
| 2 | Governor status update | 300 (5 min) | Yes | DM the governor about current status (working/idle/blocked). |

Workers are welcome to pick up queued tasks on their own, but must notify the governor when they do.

## Dynamic Reminders

Reminders can spawn reminders:
- When the task board check finds queued/active tasks, create a **one-shot 5-min** follow-up to check progress.
- "Check back on task X" after assigning work.

## Adding New Reminders

1. Create a new numbered `.md` file in this folder (e.g., `10-new-check.md`).
2. Add it to the governor table above.
3. The reminder text is the lookup key — keep it distinctive.
