# Handoff

## What this is

A Telegram MCP server for VS Code. It exposes Telegram as a set of MCP tools so a Copilot agent can communicate with the user over Telegram while working in VS Code.

## State

Everything is built, tested, and committed. The server is registered in VS Code's `mcp.json` and running. All 125 tests pass.

## Key files

- `src/server.ts` — registers all tools
- `src/telegram.ts` — shared Telegram API client + helpers (`resolveChat`, `pollUntil`, `toResult`, `toError`, validators)
- `src/markdown.ts` — converts standard Markdown to Telegram MarkdownV2 + shared `escapeV2()`, `escapeHtml()`, `resolveParseMode()` helpers
- `src/transcribe.ts` — voice message transcription (Whisper via ONNX) with reaction-based indicators (✍ while transcribing → 🫡 when done)
- `src/tools/` — one file per tool
- `loop-prompt.md` — the prompt to follow for interactive Telegram sessions
- `FORMATTING.md` — detailed formatting guide for all parse modes

## How to run the loop

Read `loop-prompt.md` and follow it exactly.

## How to make changes

1. Edit source in `src/`
2. Run `pnpm test` to verify
3. Run `pnpm build` to compile
4. Call `restart_server` via Telegram, or restart the MCP server from the VS Code Command Palette (MCP: List Servers → telegram → Restart)
5. After restart: drain stale updates with `get_updates`, send a "back online" message, resume the loop

## Tools available

| Tool | Purpose |
|---|---|
| `send_message` | Send a text message (Markdown auto-converted by default) |
| `notify` | Send a styled notification (info/success/warning/error) |
| `wait_for_message` | Block until the user sends a text or voice message (voice auto-transcribed); also returns any `reactions[]` seen during polling |
| `ask` | Send a question and wait for a free-text or voice reply |
| `choose` | Send a question with labeled buttons, return the chosen label (also accepts voice/text fallback) |
| `get_updates` | Poll for pending updates |
| `start_typing` | Sustained background typing indicator (~every 4 s until timeout) |
| `restart_server` | Exit the MCP process — VS Code relaunches it automatically |
| `get_me` | Get bot info |
| `get_chat` | Get chat info (id, type, title, username, first/last name, description) |
| `edit_message_text` | Edit a previously sent message (Markdown auto-converted, supports reply_markup) |
| `delete_message` | Delete a message (own anytime, others within 48h if admin) |
| `pin_message` | Pin a message |
| `forward_message` | Forward a message from a source chat to the configured chat |
| `send_photo` | Send a photo with optional caption (Markdown auto-converted) |
| `send_chat_action` | Send a one-shot chat action (for sustained typing, use start_typing instead) |
| `answer_callback_query` | Answer an inline button callback |
| `wait_for_callback_query` | Block until an inline button is pressed |
| `send_confirmation` | Send Yes/No buttons (Markdown auto-converted) |
| `update_status` | Create/update a live task checklist message |
| `set_reaction` | Set an emoji reaction on any message (non-premium bots: 1 per message). Use 👍 for confirmation, 🫡 for task complete, 👀 for noted, 🎉 for success. |

## Default parse_mode

`send_message`, `notify`, `edit_message_text`, `send_photo`, and `send_confirmation` all default to `"Markdown"` — standard Markdown is automatically converted to Telegram MarkdownV2. No manual escaping needed. See `FORMATTING.md` for full details.

## Voice message handling

All tools that receive messages (`wait_for_message`, `ask`, `choose`, `get_updates`) support voice messages with automatic transcription via local Whisper. Voice transcription shows a ✍ reaction on the message while processing, then swaps to 🫡 when done.

## Agent behavior notes

- **Always use `choose` for any question with a finite set of answers** — even yes/no, proceed/cancel, option A/B. Only use `ask` or `wait_for_message` for truly open-ended free-text input where choices can't be enumerated.
- Only call `start_typing` after receiving a message, before doing work — not while idle/polling
- The confirmed selection indicator in `choose` uses `▸` (triangle), not a checkmark

## Reactions

- Use `set_reaction` to react to user messages — replaces sending a separate acknowledgement message
- `wait_for_message` now returns `reactions[]` alongside each message — any `message_reaction` updates seen during polling are no longer discarded
- `DEFAULT_ALLOWED_UPDATES` includes `"message_reaction"` — user reactions arrive via `get_updates` as `{ type: "message_reaction", message_id, user, emoji_added, emoji_removed }`
- Voice transcription still uses ✍ while transcribing → 🫡 when done via `setMessageReaction`

## Button label length limits (choose)

- 2-column layout (default): max **20 chars** per label — enforced with error
- 1-column layout: max **35 chars** per label — enforced with error
- Labels over the limit return `BUTTON_LABEL_TOO_LONG` error with guidance to shorten or switch to `columns=1`

## Newline handling in Markdown bodies

`markdownToV2()` normalises literal `\n` sequences (backslash + n) to real newlines before processing. This matters because XML/MCP tool parameter values don't auto-decode `\n` — they arrive as two characters. Without this fix, `\n` would be escaped to `\\n` and show as visible `\n` in Telegram.
## Shared helpers (in markdown.ts)

- `escapeV2(s)` — escape all MarkdownV2 special characters
- `escapeHtml(s)` — escape `&`, `<`, `>` for HTML mode
- `resolveParseMode(text, mode)` — auto-convert Markdown to MarkdownV2, returns `{ text, parse_mode }`