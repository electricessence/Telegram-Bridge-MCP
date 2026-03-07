# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

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
