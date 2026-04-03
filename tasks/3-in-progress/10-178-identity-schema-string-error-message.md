# Task: Improve identity schema error when string is passed instead of array

**Created:** 2026-04-03
**Priority:** 10
**Status:** in-progress
**Assigned:** Worker 2 (SID 3)
**Repo:** electricessence/Telegram-Bridge-MCP
**Branch target:** dev

## Problem

When a caller passes `identity` as a string (e.g. `"[1, 852999]"`) instead of a JSON array
(`[1, 852999]`), the MCP framework rejects the call at the schema validation layer with a
generic Zod/JSON Schema error:

```
MCP error -32602: Input validation error: Invalid arguments for tool load_profile: [
  {
    "expected": "array",
    "code": "invalid_type",
    "path": ["identity"],
    "message": "Invalid input: expected array, received string"
  }
]
```

This error bypasses the tool handler entirely — the improved identity error messages from
PR #109 never fire because the request is rejected upstream by the schema validator.

## Root Cause

The `identity` parameter is declared as `type: "array"` in the tool's JSON Schema (via Zod).
The MCP framework validates inputs against this schema before calling the handler. Strings are
rejected at that layer with a generic message.

## Fix

For every MCP tool that accepts an `identity` parameter, change the Zod schema for `identity`
from a strict array type to `z.unknown()` (or `z.union([z.array(...), z.string(), z.unknown()])`),
then validate inside the handler and return a targeted error when a string is detected:

> *"identity must be a JSON array [sid, pin], not a string — pass `identity: [1, 852999]`,
> not `identity: \"[1, 852999]\"`"*

The handler-level validation should:
1. Check if value is a string → return the specific string-passed error with example
2. Check if value is not an array → return "identity must be a JSON array [sid, pin]"
3. Check if array length !== 2 or elements aren't numbers → return specific format error
4. Otherwise proceed as normal

## Scope

- Find all tool definitions in `src/tools/` that declare an `identity` parameter
- Update the Zod schema for `identity` in each to accept unknown input
- Add handler-level validation with targeted error messages
- Update tests to cover the string-passed case

## Acceptance Criteria

- [ ] Passing `identity: "[1, 852999]"` (string) returns a clear, actionable error message
- [ ] Passing `identity: [1, 852999]` (array) continues to work as before
- [ ] Tests cover the string identity case for at least one tool (e.g. `dequeue_update`)
- [ ] All existing tests pass
- [ ] Typecheck clean
