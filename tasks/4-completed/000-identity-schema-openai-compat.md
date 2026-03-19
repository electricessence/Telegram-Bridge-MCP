# Fix identity schema OpenAI model compatibility

**Type:** Bug fix
**Priority:** 000 (Critical — blocks all tool calls on OpenAI models)
**Source:** Runtime error when GitHub Copilot uses OpenAI models

## Problem

The `IDENTITY_SCHEMA` in `src/tools/identity-schema.ts` used `z.array(z.number().int()).length(2)`. Zod's `.length(2)` constraint causes the MCP SDK to serialize the schema with `items` as a two-element array (tuple-style `prefixItems`), which OpenAI's JSON Schema validator rejects:

```
Invalid schema for function 'mcp_telegram_append_text':
[{'type': 'integer', ...}, {'type': 'integer', ...}] is not of type 'object', 'boolean'
```

This breaks **every tool call** when an OpenAI model is selected, since all tools include the `identity` parameter.

Anthropic models are unaffected — their tool-use validator accepts tuple-style `items`.

## Fix

Remove `.length(2)` from the Zod schema. Length is already enforced at runtime by `requireAuth()` — a short array yields `pin === undefined`, which fails `validateSession` with `AUTH_FAILED`.

## Code Path

- `src/tools/identity-schema.ts` — remove `.length(2)` from `IDENTITY_SCHEMA`

## Acceptance Criteria

- [x] `.length(2)` removed from `IDENTITY_SCHEMA`
- [x] Runtime validation still rejects bad identity arrays (via `requireAuth`)
- [x] All tests pass
- [x] Build clean, lint clean
- [x] `changelog/unreleased.md` updated

## Completion

Removed `.length(2)` from `IDENTITY_SCHEMA` in `src/tools/identity-schema.ts`. The schema now emits `{ type: "array", items: { type: "integer" } }` which is valid for both OpenAI and Anthropic JSON Schema validators. Runtime length enforcement is handled by `requireAuth()` in `session-gate.ts` — destructuring `[sid, pin]` from a short array produces `undefined` pin, which `validateSession` rejects with `AUTH_FAILED`. All 1457 tests pass, build and lint clean.
