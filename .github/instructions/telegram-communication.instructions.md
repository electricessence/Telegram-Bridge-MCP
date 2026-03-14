---
applyTo: "**"
---
# Telegram Communication

> **Authoritative guide:** `docs/communication.md` · **MCP resource:** `telegram-bridge-mcp://communication-guide`
>
> At session start, load the MCP resource for full patterns (session flow, button design, animations, commit/push flow, loop, session end).

When Telegram MCP tools are available, **all communication goes through Telegram**.

## Session Flow

```text
announce ready → dequeue_update (loop) → on message:
  a) voice? → set temporary 👀
  b) show thinking animation
  c) plan clear? → switch to working animation
  d) ready to reply → show_typing → send
→ loop
```

## Non-Negotiable Rules

1. **Reply via Telegram** for every substantive response — not the agent panel.
2. **`confirm`** for yes/no · **`choose`** for multi-option — always buttons.
3. **👀 on voice messages only — always temporary.** Use `timeout_seconds ≤ 5`, omit `restore_emoji` to auto-remove. Resolve to 🫡 or 👍 when done. Skip 👀 on text messages entirely.
4. **`show_typing`** just before sending a reply — signals response is imminent, not a generic receipt.
5. **Watch `pending`.** Non-zero means the operator sent more while you were working — check before acting.
6. **Announce before major actions** (`send_text` or `notify`). Require `confirm` for destructive/irreversible ones.
7. **`dequeue_update` again** after every task, timeout, or error — loop forever.
8. **Never assume silence means approval.**

## Tool Selection

| Situation | Tool |
| --- | --- |
| Pure statement / preference | React (🫡 👍 👀 ❤) — no text reply |
| Yes/No decision | `confirm` |
| Fixed options | `choose` (blocking) · `send_choice` (non-blocking) |
| Open-ended input | `ask` |
| Short status (1–2 sentences) | `notify` |
| Thinking / considering | `show_animation` (thinking preset) |
| Executing / working | `show_animation` (working preset) |
| Response is imminent | `show_typing` |
| Cancel an animation | `cancel_animation` |
| Structured result / explanation | `send_text` (Markdown) |
| Build / deploy / error event | `notify` with severity |
| Multi-step task (3+) | `send_new_checklist` + `pin_message` |
| Completed work / ready to proceed | `confirm` (single-button CTA) |

## Button Design

- `primary` color for the expected/positive action — guides the operator's eye.
- Unbiased A/B choices: no color on either button.
- Symbols/unicode icons strongly encouraged. **All-or-nothing** — if one button has a symbol, all must.
- Emojis only in unstyled buttons; use plain text + unicode when a style is applied.

## Async Wait Etiquette

When waiting for external events (CI, code review, deploy, etc.), **keep the channel alive**:

1. **Use a persistent animation** — `show_animation` with `persistent: true` to signal you are watching.
2. **Loop with short timeouts** — call `dequeue_update(timeout: 300)` (5 min) repeatedly; never block indefinitely.
3. **Check in proactively** — after each poll cycle, send a brief status update if nothing has changed (e.g., "still waiting on CI...").
4. **Handle interrupts** — if the operator sends a message during the wait, process it immediately; do not defer until the external event arrives.
5. **Cancel the animation** before sending any substantive reply — `cancel_animation` turns it into a permanent status message.
6. **Never go silent** — an animation without a check-in loop looks like a hung process. Proactive updates build trust.

