---
Created: 2026-04-11
Status: Draft
Host: local
Priority: 10-488
Source: Operator directive (2026-04-11 — breadcrumb startup chain)
---

# 10-488: Help/Hint Breadcrumb System

## Objective

Make the TMCP bridge self-teaching. Every agent should only need to call
`session/start` — the bridge then guides them through hints and help topics
until they're operational. No agent file should duplicate communication patterns
the bridge already provides.

## Context

Operator directive: "They just call session/start. That's it. Session/start
gives them everything they need." The bridge should breadcrumb agents through
startup → communication basics → everything else via a chain of hints and help
topics.

Deputy audit (2026-04-11) found:
- No `quick_start` topic exists — `startup` is closest but omits core loop
- Only `session/start` emits a hint — no other actions do
- `startup` topic mentions `profile/load` without explaining why
- Breadcrumb chain is shallow: `session/start → startup → guide` (guide is heavy)
- No intermediate "quick essentials" layer

## Scope

### Must Have

- [ ] Add `help(topic: 'quick_start')` — dequeue loop, send basics, DM pattern
- [ ] Update `startup` topic to reference `quick_start` explicitly
- [ ] Add hint to `profile/load` response pointing to next action
- [ ] Add hint to first `dequeue` response about pending message draining
- [ ] Ensure breadcrumb chain: `session/start → startup → quick_start → help`

### Should Have

- [ ] Review all action handlers for missing hints
- [ ] `startup` topic should explain WHY to call `profile/load`
- [ ] Reduce reliance on `guide` topic (full behavior.md) for new agents

### Could Have

- [ ] Tutorial mode — first use of each tool provides extra inline guidance
  per session, then collapses to standard hints (operator ideation, needs triage)

## Acceptance Criteria

- [ ] New agent calling only `session/start` → `help(startup)` → `help(quick_start)` can become operational without reading any CLAUDE.md communication guide
- [ ] All actions in the happy path include forward-pointing hints
- [ ] Tests cover hint presence in action responses
- [ ] Token formula NOT exposed in startup topic (per 10-485 item 1)
