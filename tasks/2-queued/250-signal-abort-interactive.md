# Feature: Signal Abort During Interactive Wait

## Type

Testing

## Priority

250 (medium — MCP protocol correctness)

## Problem

The MCP protocol passes an `AbortSignal` to tool handlers. When the client
disconnects or cancels the request, the signal fires. Interactive tools that
block (`confirm`, `choose`, `ask`) should respect this signal and return
cleanly instead of hanging forever.

All three tools wire the signal through to their polling functions. When the
signal fires, they return `null` (for `confirm`/`choose`) or check
`signal.aborted` (for `ask`). But no test ever fires an abort signal during
the wait to verify it works.

## Key Facts (from source)

### confirm and choose — return `null` on abort

`src/tools/button-helpers.ts` `pollButtonPress` (line 55):

```typescript
export async function pollButtonPress(
  _chatId: number,
  messageId: number,
  timeoutSeconds: number,
  signal?: AbortSignal,
  sid?: number,
): Promise<ButtonResult | null> {
  // ...
  while (Date.now() < deadline) {
    if (signal?.aborted) return null;  // ← Returns null on abort
    // ...
  }
}
```

`pollButtonOrTextOrVoice` (line 104) has the same pattern — returns `null` on
abort.

Both `confirm.ts` (line 75) and `choose.ts` (line 71) destructure `{ signal }`
from the MCP extras and pass it to the poll functions.

When `pollButtonPress` returns `null`, `confirm` treats it the same as timeout
(returns `{ timed_out: true }`). Same for `choose`.

### ask — checks `signal.aborted` inline

`src/tools/ask.ts` checks `signal.aborted` in its polling loop and returns
`{ timed_out: false, aborted: true }`.

## Test Scenarios

### SC-1: ask — abort during text wait

1. Call `ask` tool with an `AbortController`'s signal
2. Before any reply arrives, call `controller.abort()`
3. Verify `ask` resolves promptly (does not hang until timeout)
4. Verify result is `{ timed_out: false, aborted: true }`

### SC-2: confirm — abort during button wait

1. Call `confirm` tool with an `AbortController`'s signal
2. Before any callback arrives, call `controller.abort()`
3. Verify `confirm` resolves promptly
4. Verify result is `{ timed_out: true }` (null from `pollButtonPress` →
   confirm treats as timeout)
5. Verify the message hook (if any) is cleaned up — no dangling subscriptions

### SC-3: choose — abort during button wait

1. Call `choose` tool with an `AbortController`'s signal
2. Before any callback arrives, call `controller.abort()`
3. Verify `choose` resolves promptly
4. Verify result is `{ timed_out: true }` (same null → timeout mapping)
5. Verify hook cleanup

### SC-4: Abort after result already received

1. Call `confirm`, simulate button press → resolves with `{ confirmed: true }`
2. Fire `controller.abort()` **after** the tool already returned
3. Verify no crash, no error thrown (abort on resolved promise is a no-op)

## Code References

- `src/tools/ask.ts` — `signal.aborted` check in polling loop
- `src/tools/button-helpers.ts` — `pollButtonPress` (line 55, abort check),
  `pollButtonOrTextOrVoice` (line 104, abort check)
- `src/tools/confirm.ts` — destructures `{ signal }` at line 75, passes to
  `pollButtonOrTextOrVoice`
- `src/tools/choose.ts` — destructures `{ signal }` at line 71, passes to
  `pollButtonOrTextOrVoice`

## Acceptance Criteria

- [ ] All 4 scenarios pass
- [ ] Each test is independent (no shared state)
- [ ] `pnpm test` — all pass
- [ ] `pnpm lint` — zero errors
- [ ] `pnpm build` — compiles clean

## Constraints

- Test file: `src/tools/signal-abort.test.ts`
- Use `AbortController` from Node.js standard library
- Each scenario independent
- Test file only — no production code changes
