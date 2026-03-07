# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Changed

- **Extracted all inline regex literals to named module-level constants** — 28 constants in `tts.ts` (`RE_ESCAPE_NEWLINE`, `RE_FENCED_CODE`, `RE_HTML_B`, `RE_TRAILING_SLASH`, etc.); `RE_BOT_COMMAND` in `set_commands.ts`; trailing-slash removal in `transcribe.ts` replaced with `endsWith`/`slice` string method
- **Code quality pass across 12 files** — guard clauses, no-else-after-return, ternaries, vertical dot chains, line-length (<100 chars), and deduplication:
  - `telegram.ts`: `advanceOffset` uses early return; `classifyGrammyError` and all validators split long return objects vertically; `validateCaption`, `validateCallbackData`, `validateText`, `validateTargetChat`, `resolveChat` refactored to guard-clause / positive-first pattern; `getApi()` and `getSecurityConfig()` use guard-clause + return-assignment; `SecurityConfig.userId` typed as `number` (`0` = no filter) — `> 0` check replaces null checks throughout; extracted `resolveMediaSource()` utility (path guard + http/https/file_id dispatch) shared by `send_document`, `send_audio`, `send_video`
  - `send_document.ts`, `send_audio.ts`, `send_video.ts`: now use `resolveMediaSource()` — 30 lines of duplicated path/URL validation replaced with a 3-line call
  - `ask.ts`: renamed `chatErr` → `textErr`; removed redundant `?? undefined` from `reply_to_message_id`; split long voice-branch return
  - `get_update.ts`: replaced `Awaited<ReturnType<typeof filterAllowedUpdates>>` with `Update[]`; extracted hint ternary to named const
  - `button-helpers.ts`: extracted private `appendSuffixAndEdit` helper — `editWithTimedOut`, `editWithSkipped`, and `ackAndEditSelection` now share it; split two long return objects in `pollButtonOrTextOrVoice`; `getApi().answerCallbackQuery().catch()` chain made vertical
  - `markdown.ts`: added `V2_SPECIAL_CHAR` non-global regex for single-char `.test()` — eliminates `lastIndex = 0` reset after each use
  - `tts.ts`: renamed inner `body` shadow variable → `errorBody` in `synthesizeHttpToOgg`; `getLocalPipeline()` uses guard-clause + return-assignment
  - `transcribe.ts`: extracted `canReact` boolean — eliminated duplicated guard in `transcribeWithIndicator`; `getApi().setMessageReaction().catch()` chains made vertical; `getPipeline()` uses `??=` (nullish coalescing assignment)
  - `typing-state.ts`: added `TypingAction` type alias for the union; extracted `unrefTimer()` helper — replaced 3 repeated inline guards
  - `topic-state.ts`: `applyTopicToTitle` two-branch if/return → ternary
  - `update-buffer.ts`: `drainN` — removed intermediate `taken` variable, direct return
  - `session-recording.ts`: extracted `pushEntry()` helper — `recordUpdate` and `recordBotMessage` no longer duplicate the cap-and-push logic
  - `update-sanitizer.ts`: all 11 long single-line return objects split vertically; unused `direction` binding renamed → `_direction`
  - `download_file.ts`: `isTextFile` inner `if (fileName)` block flattened to single-line guard

- **`chatId` type hardened to `number` throughout** — `SecurityConfig.chatId` changed from `string | null` to `number` (`0` = no filter, consistent with `userId`); extracted private `parseEnvInt(envVar): number` helper shared by both fields (returns `0` for unset/invalid, warns on invalid); `resolveChat()` now returns `number | TelegramError` (was `string | TelegramError`), eliminating all `String()` / `parseInt()` casts at call sites; `trySetMessageReaction(chatId)` parameter changed from `string` to `number`; all 23+ outbound tool files updated — type guards changed from `typeof chatId !== "string"` to `typeof chatId !== "number"`; `temp-message.ts` `PendingTemp.chatId: number`; `button-helpers.ts` all helper functions accept `chatId: number`, `String(id) === chatId` comparisons replaced with direct `id === chatId`

- **Added TypeScript standards instruction file** — `.github/instructions/typescript-standards.instructions.md` documents project-wide conventions (guard clauses, type narrowing, sentinel values, etc.) for Copilot and contributors

### Fixed

- **Identifier underscores no longer rendered as italic**: underscores bounded by word characters (e.g. `STT_HOST`, `my_var`) are now escaped in `markdownToV2` instead of triggering italic formatting — prevents cross-word pairing like `TTS_HOST … STT_HOST` from accidentally italicising the text between them

### Security

- **Path traversal in `send_document`, `send_audio`, `send_video`**: local file reads now restricted to `SAFE_FILE_DIR` (`$TMPDIR/telegram-bridge-mcp`); paths outside are rejected
- **Rejected plain HTTP URLs in media send tools**: `send_document`, `send_audio`, `send_video` now reject `http://` URLs — HTTPS required to prevent interception in transit
- **Filename collision in `download_file`**: saved filenames now include a `Date.now()_` prefix to prevent silent overwrites; returned `file_name` field remains the original name
- **CSPRNG for pairing code**: `setup.ts` now uses `crypto.randomInt()` instead of `Math.random()` for pairing code generation
- **BOT_TOKEN redacted in setup output**: `pnpm pair` no longer prints the full token to the terminal — only the first 8 chars are shown
- **TTS/STT error bodies no longer forwarded to LLM**: raw server error responses from TTS/STT providers are now logged to stderr only; a generic message is returned to the agent
- **`filterAllowedUpdates` covers `message_reaction` and `my_chat_member`**: these update types now have sender/chat ID extracted and filtered against `ALLOWED_USER_ID`/`ALLOWED_CHAT_ID`
- **`send_confirmation` validates callback data length**: `yes_data` and `no_data` are now validated against the 64-byte Telegram limit before sending
- **Supply chain / behavior guide integrity note**: documented in `SECURITY-MODEL.md` that `BEHAVIOR.md` is loaded verbatim into agent context; tampered content would inject instructions
- **HTTPS startup warning for TTS/STT hosts**: server now emits a `[warn]` to stderr at startup if `TTS_HOST` or `STT_HOST` is set but does not use `https://`

---

## [1.16.0] — 2026-03-07

### Security

- **Auth bypass fix**: `filterAllowedUpdates` now default-denies updates with undefined sender ID (channel posts, anonymous admins were previously let through)
- **Path traversal in `download_file`**: filenames from Telegram are now sanitized with `basename()` and leading dots stripped before writing to disk
- **File permissions**: downloaded files written with `0o600` (owner read/write only) instead of world-readable
- **`send_voice` file restriction**: local file reads in `sendVoiceDirect` restricted to the server's temp directory; check uses `path.relative` to prevent prefix-bypass (e.g. `telegram-bridge-mcp2/`)
- **`filterAllowedUpdates` null-chat gap**: updates where chat ID cannot be determined now default-denied when `ALLOWED_CHAT_ID` is configured

### Removed

- **`forward_message` tool**: removed. Forwarding a message back into the same single-user chat is redundant — `pin_message` covers the intent with less API surface.

### Changed

- Upgraded base Docker image from `node:22-slim` to `node:24-slim` (even-numbered release, becomes LTS Oct 2026, better security posture than the odd-numbered 25)
- Bumped `grammy` to 1.40.1
- Bumped `@modelcontextprotocol/sdk` to 1.27.1
- Bumped `zod` to 4.3.6
- Bumped `dotenv` to 17.3.1
- Bumped `@types/node` to 25.3.3

### Added

- 25 new security tests covering `filterAllowedUpdates`, `validateTargetChat`, `resolveChat`, offset management, and `sendVoiceDirect` path restriction (400 tests total)
- `CHANGELOG.md`

### Fixed

- `u.message?.chat?.id` optional chain (was `chat.id`, would throw TypeError if `chat` absent)

---

## [1.15.1] — prior

See git history.
