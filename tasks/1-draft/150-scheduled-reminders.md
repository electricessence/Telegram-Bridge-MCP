# Task 150 — Scheduled Reminders (Idle-Queue Triggers)

## Summary

Allow agents to register **reminders** that fire when the message queue is idle. When `dequeue_update` times out with no operator/worker messages, any due reminders surface as synthetic events — enabling agents to self-prompt, check on processes, or nudge the operator.

## Motivation

Agents currently rely on manual discipline (idle loop checklists) to remember follow-ups. A built-in reminder system makes this automatic and reliable:
- "Remind me to check CI in 5 minutes"
- "After 1 minute of idle, ask the operator if they reviewed the PR"
- Recurring reminders: "Every 10 minutes, check worker health"

## Design

### New MCP Tool: `set_reminder`

```ts
{
  name: "set_reminder",
  inputSchema: {
    text: z.string().max(500),        // Reminder message
    delay_seconds: z.number().min(10).max(86400), // Fire after N seconds of idle
    recurring: z.boolean().optional(), // Re-arm after firing? (default: false)
    id: z.string().optional(),         // Optional ID for cancellation
  }
}
```

### New MCP Tool: `cancel_reminder`

```ts
{
  name: "cancel_reminder",
  inputSchema: {
    id: z.string(),  // Reminder ID to cancel
  }
}
```

### New MCP Tool: `list_reminders`

```ts
{
  name: "list_reminders",
  // No input — returns all active reminders for the calling session
}
```

### Delivery Mechanism

When `dequeue_update` times out (empty queue), before returning the empty result, check for due reminders:

1. Compare `now` against each reminder's `created_at + delay_seconds`
2. If due, include in the response as a synthetic event:
   ```json
   {
     "id": -100,
     "event": "reminder",
     "from": "system",
     "content": {
       "type": "reminder",
       "text": "Check if CI passed for commit abc1234",
       "reminder_id": "ci-check-1",
       "recurring": false
     }
   }
   ```
3. One-shot reminders are deleted after firing
4. Recurring reminders reset their timer

### State Module: `reminder-state.ts`

- `Map<number, Reminder[]>` keyed by SID (per-session reminders)
- Functions: `addReminder()`, `cancelReminder()`, `listReminders()`, `getDueReminders()`, `resetReminderTimer()`
- Reminders cleared when session closes

## Scope

### Files to Create
- `src/reminder-state.ts` — state management
- `src/reminder-state.test.ts` — unit tests
- `src/tools/set_reminder.ts` — MCP tool
- `src/tools/set_reminder.test.ts` — tool tests
- `src/tools/cancel_reminder.ts` — MCP tool
- `src/tools/cancel_reminder.test.ts` — tool tests
- `src/tools/list_reminders.ts` — MCP tool
- `src/tools/list_reminders.test.ts` — tool tests

### Files to Modify
- `src/server.ts` — register new tools
- `src/poller.ts` or dequeue handler — inject reminder check on timeout
- `changelog/unreleased.md` — feature entry
- `docs/super-tools.md` — document reminder tools

## Open Questions

- Should reminders fire only on idle timeout, or also support absolute time ("remind me at 3pm")?
- Should the operator be able to see/manage agent reminders?
- Max reminders per session? (Suggest: 20)
- Should recurring reminders have a max repeat count?

## Priority

High — enables reliable self-prompting and process monitoring without manual discipline.
