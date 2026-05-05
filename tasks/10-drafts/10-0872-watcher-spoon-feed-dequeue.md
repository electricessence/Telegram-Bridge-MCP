---
id: "10-0872"
title: "Watcher spoon-feeds dequeue — emit drained events instead of just a wake bell"
type: feature
priority: 50
status: draft
created: 2026-05-05
repo: Telegram MCP
delegation: Curator
depends_on: ["10-0871"]
---

# Watcher spoon-feeds dequeue

## Context (2026-05-05)

Current activity-file pattern:

1. TMCP bumps mtime on event.
2. Agent's watcher (Monitor or equivalent) detects mtime change, emits a wake-bell line ("call dequeue()").
3. Agent reads the line, calls the `dequeue` MCP tool, gets the events, acts.

That's two round-trips per wake (watcher → agent, agent → TMCP dequeue). The watcher could collapse it: call dequeue itself on detection, emit the *drained events* as the wake-bell content. Agent reads the events directly in the notification, no second round-trip.

## Approach

The watcher is a bash/PS subprocess outside the harness's MCP client — it can't invoke MCP tools the way the agent can. But TMCP already exposes its MCP server over Streamable HTTP at `/mcp` (per memory `project_sse_keepalive.md`). So the watcher can speak JSON-RPC over HTTP and call dequeue directly.

Watcher pseudocode:

```bash
f="<activity_file_path>"
token=<session_token>
endpoint="http://localhost:<tmcp_port>/mcp"

prev=$(stat -c%Y "$f" 2>/dev/null)
while true; do
  cur=$(stat -c%Y "$f" 2>/dev/null)
  if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
    payload=$(curl -sS -X POST "$endpoint" \
      -H 'Content-Type: application/json' \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mcp__telegram-bridge-mcp__dequeue\",\"arguments\":{\"token\":$token,\"max_wait\":0}},\"id\":1}")
    echo "$payload"
    prev=$cur
  fi
  sleep 1
done
```

Each emit becomes a notification the agent reads, with the events already drained.

## Open design questions (must answer before implementation)

1. **Token lifecycle in the watcher.** The watcher needs the session token. Options: (a) agent provides it via env var/arg when starting the watcher, (b) watcher reads `memory/telegram/session.token` on startup. (a) is cleaner; (b) is fragile.
2. **Endpoint discovery.** The watcher needs to know the TMCP HTTP port. Hardcoded? Env var? Read from a TMCP-published config file? `mcp-config.json` has hints.
3. **Error handling.** If TMCP is down, dequeue 500s — what does the watcher emit? Probably a single "TMCP unreachable" line, not a noisy retry storm.
4. **Pending continuation.** `dequeue` returns `pending: N` when more events remain. Current bell-only pattern lets the agent decide to drain; spoon-feed pattern needs the watcher to loop until pending=0 or stop after the first batch and let the next mtime bump fire another call. Probably "first batch only" — keeps watcher logic simple, mtime bumps handle continuation.
5. **Output format.** Raw JSON-RPC envelope is noisy. Strip to just `result.updates`? Or keep envelope so error paths surface?
6. **Cross-platform.** PS-side watcher does the same with `Invoke-RestMethod`. Both need to be authored or only the platform actually used.
7. **Auth surface.** Currently `/mcp` is unauth from localhost? Verify before assuming the watcher can hit it without extra headers.

## Fix

1. Pin the design questions above with operator.
2. Document the canonical watcher recipe in the `activity/file` help topic added by 10-0871.
3. Consider shipping a reference watcher script in `tools/` (TMCP repo) that agents can invoke as-is — `tools/activity-watcher.sh` and `tools/activity-watcher.ps1`.
4. Update the activity/file response hint to point to the script, e.g.: `"Run tools/activity-watcher.sh <file_path> <token> as your watcher"`.

## Acceptance criteria

- Agent receives drained events directly from a single wake notification — no follow-up `dequeue` tool call needed.
- Watcher script is in TMCP repo, executable, documented in help topic.
- Error path (TMCP unreachable) surfaces a clear message, not silence or a retry storm.
- Token + endpoint discovery is documented.

## Out of scope

- Replacing the bell-only pattern outright. Both patterns coexist; agents pick based on monitor capability.
- Refactoring TMCP's HTTP/MCP transport.
- Permission grants for Monitor across agent roles (workspace concern).

## Dispatch

Curator-owned. Design first, then split into Worker tasks once the open questions are pinned. Spec is the deliverable here, not the script.

## Bailout

Curator owns; no agent bailout. If design dead-ends (e.g. `/mcp` requires auth headers the watcher can't get), escalate to operator with the specific blocker.

## Notes

- Saves one tool round-trip per wake — at fleet scale (4+ agents waking dozens of times an hour), that's meaningful.
- Pre-drain also means the agent's first chat-stream signal IS the event content, not a "go fetch" pointer. Better information density per turn.
- The bell-only pattern stays as the fallback when the watcher tool can't speak HTTP (rare, but possible on locked-down sandboxes).
