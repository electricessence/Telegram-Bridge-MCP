# 650 — Global `_bypassing` flag race condition

## Problem

`_bypassing` in `src/outbound-proxy.ts` is a **module-level boolean** shared across all sessions. The animation system sets it `true` inside `bypassProxy()` to prevent re-entrancy when cycling frames. But because Node.js event loop can interleave awaits, a concurrent tool call from a different session can observe `_bypassing === true` and skip critical hooks.

### Reproduction scenario (observed in production)

1. SID 1 has an active `show_animation`. Timer fires `cycleFrame()` → `bypassProxy(() => getRawApi().editMessageText(...))` → sets `_bypassing = true`.
2. While that edit is in-flight (awaiting HTTP), SID 2's `sendVoiceDirect` completes its fetch and calls `notifyAfterFileSend()`.
3. `notifyAfterFileSend` checks `if (_bypassing) return;` — sees `true` from SID 1's animation — **returns immediately**.
4. `recordOutgoing()` never runs → `trackMessageOwner()` never runs → message ownership is lost.
5. User replies to the untracked message → `resolveTargetSession()` → `getMessageOwner()` returns 0 → ambiguous → routes to governor (SID 1) instead of the actual sender (SID 2).

### Secondary issue

`_fileSendTypingGen` (line ~116) is also a module-level number, not per-session. If two sessions send files concurrently, typing-cancel races. Lower severity (cosmetic) but should be fixed in the same pass.

## Root cause

`_bypassing` is global state in a concurrent async environment. The animation system's bypass leaks to unrelated sessions across await boundaries.

## Fix

Replace the global boolean with `AsyncLocalStorage<boolean>`. Each `bypassProxy()` call creates its own ALS context — concurrent tool calls in other sessions see their own (non-bypassed) context.

### Changes required

**`src/outbound-proxy.ts`**:

1. Add `import { AsyncLocalStorage } from "node:async_hooks";`
2. Replace `let _bypassing = false;` with `const _bypassAls = new AsyncLocalStorage<boolean>();`
3. Rewrite `bypassProxy()`:

   ```typescript
   export async function bypassProxy<T>(fn: () => Promise<T>): Promise<T> {
     return _bypassAls.run(true, fn);
   }
   ```

4. Add helper:

   ```typescript
   function isBypassing(): boolean {
     return _bypassAls.getStore() === true;
   }
   ```

5. Replace all `if (_bypassing) return ...;` guards with `if (isBypassing()) return ...;`

6. Make `_fileSendTypingGen` per-session (use a `Map<number, number>` keyed by SID, or pass through ALS).

**`src/outbound-proxy.test.ts`**: Update tests that mock or assert `_bypassing` behavior to use the ALS-based approach.

**`src/animation-state.test.ts`**: The mock `bypassProxy: (fn) => fn()` should still work since it just calls the function directly.

## Acceptance criteria

- [ ] `_bypassing` is no longer a global boolean — uses `AsyncLocalStorage`
- [ ] `bypassProxy()` scopes the bypass to only the calling async context
- [ ] `notifyBeforeFileSend` / `notifyAfterFileSend` and the Grammy proxy guards all use `isBypassing()`
- [ ] `_fileSendTypingGen` is per-session (not a global number)
- [ ] Existing tests pass (1736 baseline)
- [ ] New test: concurrent bypass — one context bypassed, another context is NOT bypassed
- [ ] Build passes, lint clean

## Files to modify

| File | Scope |
| --- | --- |
| `src/outbound-proxy.ts` | Core fix — ALS bypass, per-session typing gen |
| `src/outbound-proxy.test.ts` | Update bypass tests, add concurrency test |

## Risk

Low — `bypassProxy` callers don't need changes (they already pass an async function). The ALS approach is proven in this codebase (`session-context.ts` uses it). Animation test mock (`(fn) => fn()`) is compatible.
