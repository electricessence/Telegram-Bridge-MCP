# [Unreleased]

### Added

- `session_start(reconnect: true)` re-authorization flow: when a session with the same name already exists, shows a simple ✅ Approve / ⛔ Deny dialog to the operator; on approval returns the same SID and PIN so the agent can resume without a server restart.
- Updated `NAME_CONFLICT` error message to hint at `reconnect: true` syntax for session recovery.
- `confirmYN` tool: Yes/No confirmation variant that defaults to 🟢 Yes / 🔴 No buttons with no color styling; shares the same handler as `confirm`.

### Changed

- `confirm` tool now defaults to `OK` (primary/blue) and `Cancel` (unstyled/gray) buttons instead of 🟢 Yes / 🔴 No.
- `confirm` tool `yes_style` now defaults to `primary` so the OK button is visually prominent by default.
