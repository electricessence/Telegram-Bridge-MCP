# [Unreleased]

## Added

- Added `mcp-config.example.json` as a reference config template
- Added async wait etiquette section to `telegram-communication.instructions.md`

## Changed

- Updated `LOOP-PROMPT.md` casing reference in `.github/copilot-instructions.md`

## Fixed

- Fixed potential crash in `setup.ts` when channel post has no `from` field (added optional chaining `u.message.from?.id`)
- Fixed per-iteration `AbortSignal` listener accumulation in `dequeue_update.ts` and `ask.ts` (hoisted `abortPromise` outside loop)
- Fixed misleading JSDoc in `temp-reaction.ts`: omitting `restoreEmoji` restores the previous recorded reaction, not removes it
- Fixed comment in `gen-build-info.mjs` to reflect actual output path `dist/tools/build-info.json`

## Removed

- Removed `mcp-config.json` from version control (now gitignored; copy from `mcp-config.example.json`)

