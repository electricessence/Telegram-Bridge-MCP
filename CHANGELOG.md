# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] — 1.16.0

### Security
- **Auth bypass fix**: `filterAllowedUpdates` now default-denies updates with undefined sender ID (channel posts, anonymous admins were previously let through)
- **Path traversal in `download_file`**: filenames from Telegram are now sanitized with `basename()` and leading dots stripped before writing to disk
- **File permissions**: downloaded files written with `0o600` (owner read/write only) instead of world-readable
- **`send_voice` file restriction**: local file reads in `sendVoiceDirect` restricted to the server's temp directory to prevent arbitrary file exfiltration

### Removed
- **`forward_message` tool**: removed. Forwarding a message back into the same single-user chat is redundant — `pin_message` covers the intent with less API surface. The tool also introduced a cross-chat exfiltration vector that was not worth patching.

### Changed
- `download_file` size limit (20MB) from PR #7 **not included**: Telegram Bot API already enforces this limit upstream via `getFile` returning no `file_path` for files >20MB. The check was redundant.

---

## [1.15.1] — prior
See git history.
