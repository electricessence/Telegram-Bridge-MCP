# [Unreleased]

## Added

- `save_profile` tool — snapshot session voice, animation default/presets, and reminders to a JSON profile file
- `load_profile` tool — sparse-merge a saved profile into the current session (voice, animations, reminders)
- `src/profile-store.ts` — profile path resolution, read/write utilities with path traversal protection
- `session_start` response includes `profile_hint` field directing agents to call `load_profile`
- `data/` added to `.gitignore` (runtime profiles are gitignored by default)
