---
Created: 2026-04-09
Status: Complete
Host: local
Priority: 10-436
Source: Operator testing session
---

# Session Approval Menu UX Rework

## Objective

The session approval menu (`/session` auto-approve dialog) has multiple UX issues. Buttons create new messages instead of editing in-place, toggle labels describe state instead of actions, and there's no post-click feedback. Rework the menu to collapse like choose buttons do — click → show result → done.

## Context

The operator tested the session approval flow and found:
1. **Toggle creates new message:** Clicking "Delegate to Agent On" (to toggle off) creates a new message instead of editing the existing one. Toggling back creates yet another message.
2. **Labels are state, not action:** "Delegate to Agent On" as a button label is confusing — it describes current state. Should be action-oriented: "Enable Governor Approval" or "Disable Delegation".
3. **No collapse behavior:** After clicking any button (Next Request, 10 Minutes, Dismiss), the menu should collapse to show what was selected — e.g. "Session Auto-Approved → Next Request" — then buttons disappear. Same pattern as choose buttons.
4. **Emoji consistency:** Service message buttons should follow the "all or nothing" emoji rule — if one button has an emoji, all should.

### Design Spec

After clicking a button, the message should be edited to:
```
Session Auto-Approved: → [action taken]
```

Examples:
- Click "Next Request" → message becomes "Session Auto-Approved → Next Request"
- Click "10 Minutes" → message becomes "Session Auto-Approved → 10 Minutes (expires HH:MM)"
- Click "Dismiss" → message deleted or collapsed to "Session Auto-Approved → Dismissed"
- Click toggle → message becomes "Session Auto-Approved → Governor Approval Enabled" (or "Delegation Enabled")

## Acceptance Criteria

- [x] Clicking any approval button collapses the message (edit in-place, remove buttons)
- [x] Collapsed message shows "→ [action taken]" like choose does
- [x] Toggle button label is action-oriented ("Enable Delegation" / "Disable Delegation")
- [x] No new messages created on toggle — existing message is edited
- [x] 10-minute mode shows expiration time in the collapsed message
- [x] All buttons have consistent emoji treatment
- [x] Existing tests pass; new tests cover collapse behavior

## Completion

**Branch:** `10-436` · **Commit:** `89371c2`

### Changes

- `src/built-in-commands.ts`:
  - Button labels updated with emojis: `🟡 Next request`, `🟢 10 minutes`, `✖ Dismiss`
  - Delegation toggle labels changed from state-descriptor to action-descriptor: `🤝 Enable Delegation` / `🤝 Disable Delegation`
  - `approve:delegate:on/off` callbacks now use `editMessageText` instead of `handleApproveCommand()` (no new message created)
  - All collapse messages use `→ [action]` format: "Session Auto-Approve → Next Request", "→ 10 Minutes (expires HH:MM)", "→ Dismissed", "→ Delegation Enabled/Disabled"
  - Timed collapse calculates and displays HH:MM expiry from `Date.now() + 10min`
- `src/built-in-commands.test.ts`:
  - Updated 3 existing test assertions (one/timed/dismiss) to match new text
  - Added 2 new tests for delegate:on/off verifying in-place edit behavior

### Test Results

2164/2164 passing
