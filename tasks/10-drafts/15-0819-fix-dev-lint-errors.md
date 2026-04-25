---
id: 15-0819
title: Fix pre-existing lint errors on dev branch
status: draft
priority: 15
origin: surfaced by Worker 4 during 35-441 build (2026-04-24)
---

# Fix pre-existing lint errors on dev branch

## Problem

Two lint errors exist in dev that predate recent tasks. Both are trivial type-safety issues.

### Error 1 — `src/tool-hooks.ts` line 104

```typescript
if (compiled[i]!(toolName)) {
```

`compiled[i]!` uses a non-null assertion on an array element. TypeScript array indexing returns `T | undefined` in strict mode; the `!` suppresses the undefined check. Since `i < compiled.length`, the value is guaranteed non-null, but the assertion is a lint violation (`@typescript-eslint/no-non-null-assertion`).

**Fix:** Use a typed intermediate: `const fn = compiled[i]; if (fn && fn(toolName)) {`

### Error 2 — `src/tools/session_status.ts` line 32

```typescript
const healthy = full.healthy ?? false;
```

`Session.healthy` is typed as `boolean` (non-optional). The `?? false` nullish coalescing is unreachable and triggers `@typescript-eslint/no-unnecessary-condition` (or similar rule).

**Fix:** Remove the `?? false` fallback: `const healthy = full.healthy;`

## Acceptance Criteria

- [ ] Both lint errors fixed
- [ ] `pnpm lint` passes with 0 errors
- [ ] `pnpm build` passes
- [ ] All tests pass (no regressions)

## Reversal

Simple type-safety fixes; revert via git.
