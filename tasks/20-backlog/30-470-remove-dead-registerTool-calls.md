---
Created: 2026-04-11
Status: Backlog
Host: local
Priority: 30-470
Source: Curator audit
Target: v6.0.1
---

# 30-470: Remove dead registerTool() calls from legacy tool files

## Problem

Individual tool files (choose.ts, confirm.ts, ask.ts, etc.) still contain
`server.registerTool()` calls from the pre-v6 era. These are never executed
because `server.ts` only imports 4 tool registrations: help, dequeue, send,
action.

The dead code is confusing — it looks like ~52 additional MCP tools are
registered when in reality only 4 exist.

## Proposed Fix

Remove all `server.registerTool()` calls from tool files that are NOT
imported by `server.ts`. The action dispatcher calls handler functions
directly, not through MCP tool registration.

## Acceptance Criteria

- [ ] Only 4 `server.registerTool()` calls remain (help, dequeue, send, action)
- [ ] All action-dispatched handlers still work correctly
- [ ] Tests pass
- [ ] No functional change to MCP tool surface
