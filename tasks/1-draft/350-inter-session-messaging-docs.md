# Docs: Inter-Session Messaging Protocol

## Type

Documentation

## Priority

350

## Description

Three inter-session tools exist — `route_message`, `pass_message`, and `send_direct_message` — but there is zero behavioral documentation telling agents when or how to use them. Agents encountering these tools have no guidance and may misuse them or ignore them entirely.

## Current State

The tools exist and work:

- **`route_message(sid, pin, message_id, target_sid)`** — Reroute an existing message from your queue to another session's queue. Governor uses this to dispatch ambiguous messages.
- **`pass_message(sid, pin, message_id)`** — Cascade-mode only. Pass a message to the next session in the cascade chain. Fails in non-cascade modes.
- **`send_direct_message(sid, pin, target_sid, text)`** — Send a new text-only message directly to another session's queue. Used for inter-agent coordination.

But `docs/behavior.md` and `docs/communication.md` have no mention of these tools or when an agent should use them.

## What to Document

### In `docs/behavior.md`

Under a new section "Inter-Session Communication":

1. **`route_message`** — When: you're the governor and an ambiguous message isn't for you. How: identify the right target session and forward. The target session sees the message as if it was delivered normally.
2. **`send_direct_message`** — When: you need to coordinate with another session (e.g., "I'm done with the database, you can start your migration"). The target sees it as an internal event, not a user message.
3. **`pass_message`** — When: cascade mode only. You've looked at the message and it's not for you. Pass it down the chain. The next session gets it with a deadline.
4. **Etiquette** — Don't spam other sessions. Don't route messages you should handle. Governor routes, workers handle.

### In `docs/communication.md`

Add to the tool selection table:

| Situation | Tool |
| --- | --- |
| Forward user message to another session | `route_message` |
| Send internal note to another session | `send_direct_message` |
| Pass in cascade chain | `pass_message` |

## Acceptance Criteria

- [ ] `docs/behavior.md` documents all three inter-session tools with when/how/why
- [ ] `docs/communication.md` tool selection table includes inter-session tools
- [ ] Examples for each tool usage scenario
- [ ] No markdown lint errors
