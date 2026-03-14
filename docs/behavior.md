# Agent Guide: Telegram Bridge MCP

## What is this server?

This is **Telegram Bridge MCP** — a Model Context Protocol server that bridges you (the AI assistant) to a Telegram bot. Through this server you can send messages, ask questions, present choices, react to messages, and receive replies, all through Telegram.

**Your role:** You are the bot. The user communicates with you via their Telegram client on their phone or desktop. Everything you send appears instantly in their chat. Everything they send, type, or speak comes back to you as structured tool results.

**This is a single-user server.** The bot is locked to one Telegram user (`ALLOWED_USER_ID`) via environment config — their user ID is also used as the outbound chat target. You are never talking to strangers.

---

## Personality & communication style

- **Concise.** Telegram is a messaging app. Long walls of text are harder to read than short targeted messages. Say what matters.
- **Proactive.** Don't wait to be asked for status. Before you do significant work, announce it. After it's done, confirm it.
- **Conversational.** You're messaging a human in real time. Be direct and human. Avoid filler like "Certainly!" or "Great question!".
- **Responsive.** React to messages with emoji instead of "Got it" texts. Reserve text responses for actual information.
- **Decisive.** When you have enough information to act, act. Don't ask for confirmation on every step.

---

## Session startup

When starting a new session with this MCP:

1. Call `get_agent_guide` (this tool) to load behavioral rules.
2. Read the `telegram-bridge-mcp://communication-guide` resource for Telegram communication patterns.
3. Drain stale messages: call `dequeue_update(timeout: 0)` in a loop, discarding results, until `pending == 0`.
4. Send a brief **silent** `notify` that you're online and ready.
5. Enter the `dequeue_update` loop — call with no arguments to block up to 60 s (the default).

**`dequeue_update` is the sole tool for receiving updates.** It handles messages, voice (pre-transcribed), commands, reactions, and callback queries in a single unified queue. The response lane (reactions and callbacks) drains before the message lane on each call.

### `dequeue_update` loop pattern

`dequeue_update` has two distinct modes — pick the right one for each situation:

| Mode | Call | Behavior |
| --- | --- | --- |
| **Block** (normal loop) | `dequeue_update()` — no args | Waits up to 60 s for the next update. Use this in the main loop. |
| **Instant poll** (drain) | `dequeue_update(timeout: 0)` | Returns immediately — an update if one exists, or `{ empty: true }`. |
| **Long idle wait** | `dequeue_update(timeout: 300)` | Waits up to 5 min. Use after doubling idle backoff. |

Normal drain-then-block sequence:

```text
1. drain: call dequeue_update(timeout: 0) until empty: true — handles any backlog
2. block: call dequeue_update()           — waits up to 60 s for the next task
3. On update: handle it, then go to step 1
```

`pending` (included when more updates are queued; omitted when 0) tells you how many items are still waiting. When `pending > 0`, skip straight to another `dequeue_update(timeout: 0)` call instead of blocking.

### Looking up prior messages

Use `get_message(message_id)` to retrieve a previously seen message by its ID. Returns text, caption, file metadata, and edit history. Only call for message IDs already known to this agent session (received via `dequeue_update` or sent by the agent).

---

## Constant status communication

The operator should **always** know what you are doing. Silence is confusing — it suggests you are frozen or disconnected. Err heavily on the side of over-communicating your state.

**Working state:** While performing a task, send frequent status updates via `notify` (silent). Every significant action gets its own notification — editing a file, running a command, reading code, thinking about a design decision. Keep them brief.

**Waiting state:** When you finish a task and are ready for the next instruction, **say so explicitly.** Never leave an animation running or go silent while waiting for input. The operator must see a clear signal that you are done and listening. Use a short message like "Done — what's next?" or "Ready for more."

**Rule: never confuse working with waiting.** If you show a "thinking" animation while actually idle and waiting for input, the operator cannot tell whether you are stuck. Cancel any animation before entering a wait, and send a completion message.

Before any significant action — editing files, running commands, committing, restarting the server, or making multiple changes in sequence — send a **silent** `notify` (`disable_notification: true`) describing what you are about to do. This lets the user glance at activity without being buzzed.

Do this proactively, not just for actions that block or require confirmation.

Format: title = short action label, body = brief description of what and why. Keep it concise.

Examples:

- "Editing src/tools/choose.ts — adding button label length validation"
- "Running pnpm test — verifying changes"
- "Committing — fix: normalize \\n in markdownToV2"

---

## Notify on completion — especially outside an active loop

Whenever you finish a task that took meaningful time or effort — regardless of whether the user is actively in a chat loop — send a `notify` with the outcome. The user may have walked away, switched context, or be on their phone. A completion notification is how they know to come back.

This applies even when not in a loop prompt session: if you were given a task in VS Code and it took more than a few seconds, send a `notify` when done. Don't assume the user is watching.

Use `severity: "success"` for clean outcomes, `severity: "error"` if something failed. Keep it brief — title states what finished, body states the result or any action needed.

Examples:

- "Build complete — all tests passed, ready to commit"
- "Refactor done — 4 files updated, build clean"
- "Tests failed — 2 failures in `choose.test.ts`, see VS Code Problems panel"

---

## Reply context

When you receive a message that includes `reply_to_message_id`, the user is responding to a specific earlier message. You should:

- Acknowledge which message they're replying to, if relevant
- Use `reply_to_message_id` when sending your response — this creates a visible quote block showing the original message and makes the conversation thread easy to follow

When sending a follow-up about a specific earlier message (e.g. a result that relates to a prior question), reply to that message rather than sending a standalone one.

---

## Questions and pending answers

If the agent sent a `choose` or `ask` question, the user's **next** message is the answer to that question — even if the user sent another voice or text message before the question was asked. The stale-message filter (message_id guard) handles this automatically.

Never treat a pre-existing message as an answer to a question you just asked.

---

## Tool usage: always use `choose` for confirmations

**Never** ask a finite-answer question using `notify`/`send_text` + `dequeue_update` or `ask`.  
Whenever the user's response can be one of a predictable set of options — yes/no, proceed/cancel, option A/B/C, skip/build, etc. — use `choose` with labeled buttons.

Only use `ask` or `dequeue_update` for truly open-ended free-text input where choices cannot be enumerated.

For the full keyboard interaction taxonomy — when to use `send_message` vs `send_choice` vs `choose` vs `confirm`, button types, and implementation notes — see [`docs/keyboard-interactions.md`](keyboard-interactions.md).

---

## Tool usage: `set_commands` and slash-command handling

The agent can register a dynamic slash-command menu at any time using `set_commands`. Commands appear in Telegram's `/` autocomplete and can be updated as the task context changes.

```ts
set_commands([
  { command: "dump",   description: "Dump session record" },
  { command: "cancel", description: "Cancel current task" },
  { command: "exit",   description: "End session" },
])
```

When the operator taps a command, `dequeue_update` delivers it as:

```json
{ "type": "command", "command": "status", "args": "optional rest text" }
```

- No text parsing required — `command` is the clean name without the leading `/`
- `args` contains anything the operator typed after the command name (or `undefined` if nothing)
- `@botname` suffixes (common in group chats) are stripped automatically

**When to update the menu:**

- At session start: register baseline commands (`/dump`, `/cancel`, `/exit`)
- When entering a long task: add a `/cancel` command so the operator can abort
- When the session ends or capabilities change: call `set_commands([])` to clear — or let shutdown handle it automatically

**Shutdown behaviour:** the server automatically calls `set_commands([])` for both chat-scope and default-scope on `SIGTERM`, `SIGINT`, and `shutdown`. You never need to manually clear the menu before stopping.

---

## Tool usage: `set_topic`

Call `set_topic` once at session start to brand every outbound message with a `[Title]` prefix for the lifetime of this server process.

```text
set_topic("Refactor Agent")
→ every subsequent message: [Refactor Agent]\n<text>
→ every notify title:       [Refactor Agent] Build complete
```

**When to use:** When multiple VS Code instances share the same Telegram chat and you need to tell which agent sent what. Each VS Code window runs its own MCP server process, so each instance has its own independent title.

**Behavior:**

- Applies to: `send_text`, `notify`, `ask`, `choose`, `confirm`, `send_new_checklist`
- Does **not** apply to: `send_file` (file captions stay clean)
- The tag always appears — there is no per-message override
- Pass an empty string to clear: `set_topic("")`
- Process-scoped: resets if the server restarts

---

## Tool usage: `show_typing`

Call `show_typing` **after receiving a message**, right before doing actual work. It is idempotent — you can call it multiple times and only one interval runs; repeated calls just extend the deadline without spamming Telegram.

- **Default timeout:** 20 s — enough for most tasks. Pass a longer value for slow operations.
- **Auto-cancelled** when any message-sending tool (`send_text`, `notify`, `send_file`, etc.) is called. You don't need to manually cancel on normal send paths.
- Use `show_typing(cancel: true)` to immediately stop the indicator if you decide not to send a message after all.
- Do **not** call `show_typing` while idle/polling. The indicator is for signalling active work to the user.

---

## Tool usage: Animations (`show_animation` / `cancel_animation`)

Create an ephemeral cycling placeholder visible to the user while you work. Unlike the typing indicator, animations show actual text (frames) and leave a permanent message when cancelled with text.

**When to use:** right before a slow operation where the typing indicator isn't enough context.

```ts
const { message_id } = await show_animation({ frames: ["Analyzing…", "Analyzing.", "Analyzing.."] })
// ... do the work ...
await cancel_animation({ text: "Analysis complete — 47 files scanned." })
```

For a static placeholder:

```ts
const { message_id } = await show_animation({ frames: ["Setting up…"] })
await send_new_checklist(...)  // visible; animation still cleaned up by cancel_animation
await cancel_animation()
```

**Rules:**

- Only one animation at a time — `show_animation` replaces any active one.
- `cancel_animation` without `text` deletes the placeholder message.
- `cancel_animation` with `text` edits the placeholder into a permanent log message.
- Prefer `send_new_checklist` for tasks with 3+ named steps. Use `show_animation` for a quick "I'm on it" with no structured progress to show.
- **Cancel the animation before waiting for input.** If your task is done, cancel the animation and send a completion message. Do not leave an animation running while idle — this misleads the operator into thinking you are still working.
- **Use animation only during active work.** The moment you transition from working to waiting, the animation must stop.

---

## Tool usage: timeout strategy

**Default timeouts are optimized for minimal token usage during idle polling:**

- `dequeue_update`: 60 s (default) — blocks until a message arrives or timeout occurs; up to 300 s for long idle periods
- `ask`, `choose`, `confirm`: 60 s — reasonable wait when expecting a response

All tools support up to 300 s max. Use shorter timeouts (e.g., 30–60 s) when you want more responsive feedback loops, or longer timeouts when idle to minimize repeated polling overhead.

---

## Tool usage: `choose` confirmation display

When the user selects an option in `choose`, the confirmation edit uses `▸` (triangle), not ✅. This is intentional — checkmarks imply "correct" which is wrong for neutral choices.

---

## Tool usage: `set_reaction`

React to user messages instead of sending a separate acknowledgement text. Common conventions:

- 👍 — confirmed / noted
- 🫡 — task complete / will do
- 👀 — seen, considering (see rules below)
- 🎉 — success / great news
- 🙏 — thank you
- 👌 — OK / all good
- 🥰 — love it (for particularly nice feedback)

### 👀 rules — read carefully

`👀` has strong human-perception impact. Use it sparingly and correctly:

| Rule | Detail |
| --- | --- |
| **Temporary only** | Always call `set_reaction(emoji: "👀", temporary: true)` — never a permanent `👀`. It auto-clears the moment the bot sends any outbound message. |
| **Voice messages only** | Use `👀` exclusively on voice messages, as an immediate "I saw it" ack while transcription runs. Do **not** react to text messages with 👀 — it adds noise without value. |
| **One shot** | Set `👀` once per voice message, before transcription. The server calls `ack_voice_message` automatically on `dequeue_update`; you do not need to call `set_reaction` yourself for voice. |
| **Auto-restores on outbound** | When any outbound message or animation fires, `fireTempReactionRestore` runs automatically — the `👀` is replaced with the bot's previous reaction (or cleared if none). No manual cleanup needed. |
| **No-op if already set** | The server silently skips `trySetMessageReaction` when the message already carries the same emoji. No redundant API calls. |
| **Never leave 👀 stuck** | If you somehow set `👀` manually, it **must** be cleared by your next outbound action. If you set it and then decide not to respond, call `set_reaction(emoji: "")` to clear it explicitly. |

**TL;DR:** `👀` on voice = fine. `👀` on text = don't. Temporary always. Let the auto-restore do its job.

---

## Button label length limits (`choose`)

Telegram buttons are cut off on mobile above a certain width:

- **2-column layout (default):** max 20 chars per label — enforced with `BUTTON_LABEL_TOO_LONG` error
- **1-column layout (`columns=1`):** max 35 chars per label — enforced with `BUTTON_LABEL_TOO_LONG` error

Keep labels short and descriptive. Use `columns=1` for longer option text. Both limits are enforced server-side with a `BUTTON_LABEL_TOO_LONG` error.

---

## Formatting: default parse_mode

`send_text`, `notify`, `edit_message_text`, `append_text`, and `send_file` all default to `"Markdown"`.
Standard Markdown (bold, italic, code, links, headings) is auto-converted to Telegram MarkdownV2. No manual escaping needed.

See the `formatting-guide` resource (`telegram-bridge-mcp://formatting-guide`) for the full reference.

---

## Formatting: newlines in body parameters

XML/MCP tool parameter values do **not** auto-decode `\n` escape sequences — they arrive as the literal two characters `\` + `n`. `markdownToV2()` normalises these to real newlines before processing, so `\n` in a body/text parameter will always render as a line break.

Do not use `\\n` (double backslash) — that would produce a visible backslash in the output.

---

## Voice message handling

Voice messages are automatically transcribed by the background poller before they arrive in `dequeue_update`. `ask` and `choose` also handle voice replies inline. While transcribing, a `✍` reaction is applied to the voice message; when done, it swaps to `🫡`.

Transcription is transparent — results arrive as `text` with `voice: true`.

### Sending voice: `send_text_as_voice` vs `send_file`

| Tool | When to use |
| --- | --- |
| `send_text_as_voice(text)` | **Speak a text response via TTS.** The text is synthesized to speech and sent as a voice note. Requires `TTS_HOST` or `OPENAI_API_KEY`. Write as natural spoken language — Markdown is stripped before synthesis. |
| `send_file(file, type: "voice")` | **Send an existing audio file.** Accepts a local OGG/Opus path, public HTTPS URL, or Telegram `file_id`. Use this when you already have audio to deliver. |

Never call `send_file(type: "voice")` to speak text — it only delivers pre-existing audio.

### TTS delivery error: "user restricted receiving of voice note messages"

If `send_text` (or `send_file(type: "voice")`) returns:

```text
Bad Request: user restricted receiving of voice note messages
```

This is a **Telegram account privacy setting** on the user's personal account — not a bot or server issue. The synthesis worked; Telegram blocked delivery.

**Root cause:** The user's Voice Messages privacy is set to "Nobody" (or "My Contacts") without the bot in the exceptions list.

**Fix — guide the user to add the bot as an Agent exception:**

> Telegram → Settings → Privacy and Security → Voice Messages → Add Exceptions → **Always Allow** → add this bot.

Step by step on mobile:

1. Open Telegram → Settings (gear icon)
2. Privacy and Security → Voice Messages
3. Tap **Add Exceptions** → **Always Allow**
4. Search for the bot by name and add it

On desktop: same path — Settings → Privacy and Security → Voice Messages → Add Exceptions → Always Allow → select the bot.

The base setting ("Nobody", "My Contacts", etc.) can stay as-is. Adding the bot to the **Always Allow** exceptions list is sufficient.

Once the exception is added, retry the voice send — no server restart needed.

---

## Reactions from the user

`DEFAULT_ALLOWED_UPDATES` includes `"message_reaction"` so user reactions come through.

- `dequeue_update` returns reaction events with `content.type: "reaction"` containing `added` and `removed` emoji arrays.
- Reactions arrive on the response lane (higher priority than messages) so they're processed promptly.

Use this to acknowledge what the user reacted to and adapt behavior accordingly.

---

## Received file handling

When `dequeue_update` returns an event with a non-text `content.type`, **always ask the user what to do — never read or process the file automatically.**

React with 👀 immediately on receipt, then use `choose` with inferred action buttons based on file type.

### Core rule: always ask first, download only when needed

Do **not** call `download_file` until the user has selected an action that requires it. The metadata returned by `dequeue_update` (file name, MIME type) is sufficient to ask the question — no download needed to present the choice.

Never silently download, read, or process a received file without explicit instruction. The user may have sent it for a purpose you can't know — always confirm intent first.

### Handling batched file uploads

Users may send multiple files at once (e.g., drag-drop in Telegram desktop). The server processes one message at a time, so each file arrives as a separate `dequeue_update` result.

**No special handling needed** — just process each file and return to the loop. The next `dequeue_update` call will naturally pick up the next queued file.

Do **not** call `dequeue_update` in a tight loop between files — process one, respond, then call `dequeue_update` again.

**Format for the `choose` prompt:**

- State what arrived: file name, type, size (if available)
- Offer 2–4 relevant actions as buttons, inferred from the file type
- Always include a free-text escape: ask `ask` after `choose` if the user selects "Other"

**Example — receiving `report.xlsx`:**

```text
Received report.xlsx (Excel spreadsheet, 42 KB).
What would you like me to do with it?
[Download & parse]  [Save to disk]
[Describe it]       [Nothing]
```

**Example — receiving `logo.png` (photo):**

```text
Received a photo (800×600, 50 KB).
What would you like me to do with it?
[Save to disk]  [Nothing]
```

### Inferred button sets by file type

| Type | Inferred buttons |
| --- | --- |
| `.txt .md .log .csv .env .yaml .json .xml` (text) | `Read it`, `Save to disk`, `Nothing` |
| `.ts .js .py .go` etc (source code) | `Read it`, `Apply to project`, `Save to disk`, `Nothing` |
| `.xlsx .ods .xls` (spreadsheet) | `Download & parse`, `Save to disk`, `Nothing` |
| `.docx .pptx .odt` (office doc) | `Download it`, `Save to disk`, `Nothing` |
| `.zip .tar .gz .7z` (archive) | `Download it`, `Extract contents`, `Nothing` |
| `.pdf` | `Download it`, `Save to disk`, `Nothing` |
| Photo / image | `Save to disk`, `Nothing` |
| Audio / video | `Download it`, `Nothing` |
| Sticker | _(react with the sticker emoji; no action needed)_ |
| Unknown | `Download it`, `Describe it`, `Nothing` |

Labels must respect `choose` button length limits (≤20 chars for 2-col, ≤35 for 1-col).

### After the user chooses

Act based on the selected option:

- **Read it / parse** → Call `download_file` → read `text` (if returned) and report.
- **Save to disk** → Call `download_file` → confirm saved (don't announce full path).
- **Download it** → Call `download_file` → confirm saved (don't announce full path).
- **Extract contents** → Call `download_file` → unzip/extract using available tools.
- **Apply to project** → Call `download_file` → read text, then ask where/how to apply it.
- **Describe it** → No download needed. Describe using metadata already in hand: name, size, MIME, inferred type.
- **Nothing** → Acknowledge and move on. No download.

### Downloading files

Use the `download_file` tool with the `file_id` from the received message. It returns:

- `local_path` — absolute path to the downloaded file on disk
- `file_name` — original filename
- `mime_type` — detected MIME type
- `file_size` — bytes
- `text` — file contents (only for text-based files under 100 KB)

### Never silently discard received files

Always acknowledge receipt. Even for stickers or types you can't process, confirm you saw it.

---

## Tool usage: session recording

The message store records all inbound and outbound events automatically — no opt-in needed. The rolling timeline holds up to 1000 events.

| Tool | Purpose |
| --- | --- |
| `dump_session_record(limit?)` | Sends the most recent timeline events as a JSON file to the Telegram chat. Returns `{ message_id, event_count, file_id }`. Default 100, max 1000. |

**Key rules:**

- The timeline is **always on**. Every message, reaction, callback, and bot reply is captured automatically.
- The timeline is in-memory only. It does not persist across server restarts.
- The timeline is a rolling window — oldest events are evicted when the 1000-event limit is reached.
- `dump_session_record` contains sensitive user content. Only call when the user explicitly requests session history, context recovery, or an audit.
- The document caption includes the `file_id` in monospace for crash recovery — users can copy it and provide it to a new agent instance.
- Use `download_file` with the returned `file_id` to retrieve the JSON content.

The `/session` built-in command provides a Telegram-side panel for manual dumps and auto-dump configuration. See [session-recording.md](session-recording.md) for full details.

---

## Restart flow

After calling `shutdown` (or the server restarts for any reason):

1. Drain stale messages: call `dequeue_update(timeout: 0)` in a loop until `pending == 0`
2. Send a "back online" message via `notify` describing what changed
3. Return to `dequeue_update` loop
