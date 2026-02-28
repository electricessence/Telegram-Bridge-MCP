# Loop Prompt

Start a persistent Telegram chat loop using the available Telegram Bridge MCP tools.

## Setup (once)

1. Call `get_agent_guide` — loads behavior rules and communication conventions.
2. Read `telegram-bridge-mcp://quick-reference` — tool selection and hard rules.
3. Call `get_updates` once — drain stale messages, discard all.

## The Loop

```txt
notify "ready" → wait_for_message → show_typing → do work → repeat
```

- On **timeout**: call `wait_for_message` again immediately.
- On **`exit`**: send goodbye, then stop.
- **All output**: send through Telegram — the operator is on their phone.
