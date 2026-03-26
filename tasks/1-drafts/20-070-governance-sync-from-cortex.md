# Task: Sync Governance Patterns from cortex.lan

| Field    | Value                          |
| -------- | ------------------------------ |
| Created  | 2026-03-26                     |
| Priority | 20-070                         |
| Scope    | Telegram-Bridge-MCP            |
| Stage    | 1-drafts                       |

## Goal

Port valuable governance patterns from `cortex.lan` workspace to this repo's agent/instruction files. The cortex.lan workspace has a mature governance framework that this repo currently lacks.

## Gaps Identified

### High Priority

1. **Governance Framework** — cortex.lan has 10 "Absolute Rules" in `copilot-instructions.md`; this repo's version is minimal. Key rules to adapt:
   - Friction Protocol (one retry max, never brute-force, report up)
   - Ask Questions — Don't Assume
   - Document Everything
   - No One-Off Complex Commands (write temp scripts)
   - Keep Workspace in High Order

2. **Adversarial Reviewer Agent** — cortex.lan has a dedicated skeptic agent that source-verifies claims and outputs structured RISKS/FLAWS/RECOMMENDATIONS. This repo has no equivalent.

### Medium Priority

3. **Task Drafts Sub-structure** — add `1-drafts/ready-for-queuing/` and `1-drafts/epics/` folders
4. **Friction Protocol in Worker Rules** — inject into existing `worker-rules.instructions.md`
5. **Overseer Identity Refinement** — port "librarian not taskmaster," "voice of reason," "less is more" from Curator

### Lower Priority

6. **Enhanced severity model** in code reviewer (Critical/Major/Minor/Info)

## Source Files (cortex.lan)

- `d:\Users\essence\Development\cortex.lan\cortex.lan\.github\copilot-instructions.md`
- `d:\Users\essence\Development\cortex.lan\cortex.lan\.github\agents\adversarial-reviewer.agent.md`
- `d:\Users\essence\Development\cortex.lan\cortex.lan\.github\agents\curator.agent.md` (identity sections)

## Acceptance Criteria

- [ ] `copilot-instructions.md` updated with adapted governance rules (infrastructure-specific refs removed)
- [ ] `adversarial-reviewer.agent.md` created and registered in AGENTS.md
- [ ] Worker rules updated with explicit friction protocol
- [ ] Overseer identity refined with curator-style principles
- [ ] All changes pass markdown lint
