---
Created: 2026-04-11
Status: Backlog
Host: local
Priority: 20-471
Source: Operator
---

# Checklist Completion Badge Should Reflect Outcome

## Objective

When the system auto-completes and unpins a checklist, the completion marker currently shows ✅ Complete regardless of whether all items passed. If items were skipped (⛔) or failed, the completion badge should visually indicate the checklist was not fully successful — e.g., ❌ Incomplete, 🟡 Incomplete, or 🔴 Rejected.

## Context

Operator observed a Worker complete a checklist that had some items with a stop-sign indicator (⛔ skipped/failed). The system correctly auto-replied and unpinned the checklist, but the ✅ Complete badge suggested full success. The operator needs to see at a glance whether a completed checklist requires follow-up.

## Acceptance Criteria

- [ ] Checklist completion logic inspects item statuses before choosing the badge
- [ ] All items passed → ✅ Complete
- [ ] Any items failed/rejected → 🔴 Failed (with count)
- [ ] Any items skipped (but none failed) → 🟡 Incomplete (with count)
- [ ] Badge text includes summary (e.g., "✅ Complete 7/7" or "🟡 Incomplete 5/7 — 2 skipped")
- [ ] Never use ❌ (red X) — operator dislikes it
- [ ] Tests cover all three completion states
