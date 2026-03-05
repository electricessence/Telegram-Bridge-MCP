# Session Recording

Session recording lets you capture Telegram updates in memory so you can review, summarize, or export them later in the same session.

Recording is **off by default**. You must explicitly start it. Nothing is written to disk — the buffer lives only in the running process and is cleared when the server restarts.

---

## Why session recording exists

The Telegram Bot API uses a forward-only update queue. Once you call `get_updates` or any tool that advances the offset, those updates are gone from the queue. There is no `getMessages` or history API.

This creates a gap: if the agent's context compacts, the conversation shifts topic, or you just want to review what happened earlier in a session, there is no way to go back through regular polling.

Session recording solves this by keeping a copy of every update that passes through the server while recording is active. The buffer is capped — older entries are evicted as new ones arrive — so memory use stays bounded.

---

## The four tools

### `start_session_recording`

Starts (or restarts) recording. Clears any existing buffer and begins capturing from this point forward.

```
start_session_recording(max_updates?: number)
```

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `max_updates` | 50 | 500 | Ring buffer capacity. Oldest entries are dropped when full. |

Returns: `{ recording: true, reset: boolean, max_updates, captured }`

- `reset: true` if recording was already active (buffer was wiped and restarted).

---

### `cancel_session_recording`

Stops recording **and discards the buffer**. Call `dump_session_record` or `get_session_updates` first if you want to keep the captured data.

```
cancel_session_recording()
```

Returns: `{ recording: false, was_active: boolean }`

---

### `get_session_updates`

Returns updates from the buffer as structured objects, newest-first by default.

```
get_session_updates(messages?: number, oldest_first?: boolean)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `messages` | all | Max number of updates to return |
| `oldest_first` | false | Return oldest entries first |

Returns: `{ recording, total_captured, returned, updates: [...] }`

Each update in `updates` is a sanitized object with a `type` and `content_type` field appropriate to its kind (text, photo, voice, callback_query, etc.) — the same shape used by `get_update` and `wait_for_message`. Voice messages are transcribed automatically.

---

### `dump_session_record`

Formats the entire buffer as a human-readable log string and returns it directly to the agent. No file is written; the content is returned as plain text for the agent to read, forward, or save as needed.

```
dump_session_record(clean?: boolean, stop?: boolean)
```

| Parameter | Description |
|-----------|-------------|
| `clean` | If `true`, clear the buffer after a successful dump. Recording stays active. |
| `stop` | If `true`, stop recording and clear the buffer after dumping. Implies `clean`. |

Returns a text log like:

```
# Session Recording Log
Generated: 2025-01-15T14:32:00.000Z
Recording: inactive
Updates: 5 / 50

---

[1] message · text | msg_id: 101
Hey, can you check the deployment?

[2] message · text | msg_id: 102
It's live. Here's the build output:

[3] message · document | msg_id: 103
File: build-log.txt

[4] message_reaction | msg_id: 102
Added: 👍  Removed: (none)

[5] callback_query | msg_id: 104
data: confirm_deploy

---
End of log
```

---

## Typical workflows

### Debugging a long conversation

When a task runs long and earlier context falls out of view, session recording lets you catch up on what happened:

```
1. start_session_recording()           — begin capturing
2. ... do work, exchange messages ...
3. get_session_updates(oldest_first: true)   — review the conversation
4. cancel_session_recording()          — done, buffer discarded
```

### Generating a session summary

At the end of a session, dump and summarize what was discussed:

```
1. dump_session_record(stop: true)     — export formatted log, stop recording, clear buffer
2. Summarize the log content and send via notify
```

### Exporting a conversation to a file

```
1. dump_session_record(clean: false)
2. send_document(localPath: ...) or save the returned text via a write tool
```

### Context recovery after compaction

If your context compacts mid-session and you lose track of what the user was working on:

```
1. get_session_updates(messages: 10)   — review recent activity
2. Resume from where you left off
```

---

## Important notes

- **Recording is off by default.** Call `start_session_recording` to enable it.
- **Buffer is in-memory only.** Nothing is persisted to disk. The buffer is lost on server restart.
- **The buffer is a ring.** When `max_updates` is reached, the oldest entry is evicted to make room. Set a higher `max_updates` if you need a longer window.
- **Recording captures all update types** — text, voice, photos, documents, reactions, callback queries, and anything else that passes through `get_update`, `get_updates`, `wait_for_message`, or `pollUntil`.
- **`cancel_session_recording` clears the buffer.** Use it only when you are done and no longer need the captured updates. Call `dump_session_record` or `get_session_updates` first if retention matters.
- **`dump_session_record(stop: true)` is the idiomatic end-of-session call.** It exports, stops, and clears in one step.
- **`start_session_recording` always resets.** Calling it while already recording clears the existing buffer and starts fresh.
