# Agent Behavior Reference

Rules and conventions for the agent operating this Telegram MCP server.

## Proactive silent notifications

Before any significant action — editing files, running commands, committing, restarting the server, or making multiple changes in sequence — send a **silent** `notify` (`disable_notification: true`) describing what you are about to do. This lets the user glance at activity without being buzzed.

Do this proactively, not just for actions that block or require confirmation.

Format: title = short action label, body = brief description of what and why. Keep it concise.

Examples:

- "Editing src/tools/choose.ts — adding button label length validation"  
- "Running pnpm test — verifying changes"
- "Committing — fix: normalize \\n in markdownToV2"

---

## Reply context

When you receive a message that includes `reply_to_message_id`, the user is responding to a specific earlier message. You should:
- Acknowledge which message they're replying to, if relevant
- Use `reply_to_message_id` when sending your response — this creates a visible quote block showing the original message and makes the conversation thread easy to follow

When sending a follow-up about a specific earlier message (e.g. sending a result that relates to a prior question), use `reply_to_message_id` to reply to that message rather than just sending a new standalone message.

## Tool usage: always use `choose` for confirmations

**Never** ask a finite-answer question using `notify`/`send_message` + `wait_for_message` or `ask`.  
Whenever the user's response can be one of a predictable set of options — yes/no, proceed/cancel, option A/B/C, skip/build, etc. — use `choose` with labeled buttons.

Only use `ask` or `wait_for_message` for truly open-ended free-text input where choices cannot be enumerated.

## Tool usage: `start_typing`

Only call `start_typing` **after receiving a message**, before doing work. Do not call it while idle/polling — the indicator expires in ~5 s and Telegram's own behavior shows "typing" while `wait_for_message` is long-polling anyway.

## Tool usage: `choose` confirmation display

When the user selects an option in `choose`, the confirmation edit uses `▸` (triangle), not ✅. This is intentional — checkmarks imply "correct" which is wrong for neutral choices.

## Tool usage: `set_reaction`

React to user messages instead of sending a separate acknowledgement text. Common conventions:

- 👍 — confirmed / noted
- 🫡 — task complete / will do
- 👀 — seen / noted without full ack
- 🎉 — success / great news
- 🙏 — thank you
- 👌 — OK / all good
- 🥰 — love it (for particularly nice feedback)

## Button label length limits (`choose`)

Telegram buttons are cut off on mobile above a certain width:

- **2-column layout (default):** max 20 chars per label — enforced with `BUTTON_LABEL_TOO_LONG` error
- **1-column layout (`columns=1`):** max 35 chars per label — enforced with `BUTTON_LABEL_TOO_LONG` error

Keep labels short and descriptive. Use `columns=1` for longer option text.

## Formatting: default parse_mode

`send_message`, `notify`, `edit_message_text`, `send_photo`, and `send_confirmation` all default to `"Markdown"`.  
Standard Markdown (bold, italic, code, links, headings) is auto-converted to Telegram MarkdownV2. No manual escaping needed.

See `FORMATTING.md` for the full reference.

## Formatting: newlines in body parameters

XML/MCP tool parameter values do **not** auto-decode `\n` escape sequences — they arrive as the literal two characters `\` + `n`. `markdownToV2()` normalises these to real newlines before processing, so `\n` in a body/text parameter will always render as a line break.

Do not use `\\n` (double backslash) — that would produce a visible backslash in the output.

## Voice message handling

All message-receiving tools (`wait_for_message`, `ask`, `choose`, `get_updates`) support voice messages with automatic transcription via local Whisper. While transcribing, a `✍` reaction is applied to the voice message; when done, it swaps to `🫡`.

Transcription is transparent — returned as `text` with `voice: true` in the result.

## Reactions from the user

`DEFAULT_ALLOWED_UPDATES` includes `"message_reaction"` so user reactions come through.

- `wait_for_message` returns a `reactions[]` array alongside each message, containing any `message_reaction` updates seen during the polling window. Never silently loses reactions.
- `get_updates` returns `{ type: "message_reaction", message_id, user, emoji_added, emoji_removed }` for reaction updates.

Use this to acknowledge what the user reacted to and adapt behavior accordingly.

## Restart flow

After calling `restart_server` (or the server restarts for any reason):

1. Call `get_updates` (twice if needed) to drain stale messages — discard everything
2. Send a "back online" message via `notify` describing what changed
3. Return to `wait_for_message` loop
