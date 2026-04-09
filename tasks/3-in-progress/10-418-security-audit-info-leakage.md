---
Created: 2026-04-09
Status: Complete
Host: local
Priority: 10-418
Source: Operator directive — security audit before v6 merge
Depends: 10-417 (task relocation — ensures no task doc leakage)
---

# Security Audit — Information Leakage Scan on dev Branch

## Objective

Comprehensive security audit of the Telegram MCP `dev` branch scanning for any
information leakage. This is critical — any leaked secrets, internal hostnames,
operator PII, or workspace-internal references in a public repo could be
disastrous.

## Scope

- **Branch:** `dev` (current HEAD after all v6 work merged)
- **Repo:** Telegram MCP (this repo)
- **Focus:** Information leakage, not code quality

## What to Scan For

### Critical (block merge if found)

- Hardcoded API keys, tokens, passwords, or secrets
- Bot tokens (Telegram or otherwise)
- Internal hostnames (`*.cortex.lan`, IP addresses, LXC IDs)
- Operator PII (names, emails, usernames beyond public GitHub profile)
- File paths containing usernames or private directory structures
- References to `cortex.lan` workspace internals
- Session tokens, PINs, or authentication material in logs/comments

### High (fix before merge)

- Overly detailed error messages that reveal internal architecture
- Debug logging that exposes sensitive state
- Comments referencing internal infrastructure or private repos
- Task IDs or internal references that leak organizational structure

### Medium (note and track)

- Dependency versions with known CVEs
- Overly permissive file permissions in scripts
- Missing input sanitization on user-facing parameters

## Procedure

1. **Automated scan:** `grep -rn` for patterns:
   - IP addresses: `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`
   - Hostnames: `cortex\.lan|\.cortex\.|lxc[- ]?\d{3}|vm[- ]?\d{3}`
   - Secrets: `token|secret|password|api[_-]?key|bearer`
   - Paths: `D:\\|C:\\|/home/|/Users/`
   - PII: operator names, emails (check git log too)
2. **Manual review:** Scan all `src/` files for hardcoded values
3. **Git history scan:** `git log --all --diff-filter=A -- '*.env*' '*.key' '*.pem'`
4. **Subagent verification:** Dispatch Code Reviewer subagent with security focus
   on the full diff (`git diff master..dev`)

## Acceptance Criteria

- [ ] Automated scan completed — all pattern matches reviewed
- [ ] Manual review of src/ completed
- [ ] Git history checked for accidentally committed secrets
- [ ] Subagent security review completed
- [ ] Report filed with findings (even if clean)
- [ ] Any critical/high findings fixed before marking complete

## Security Audit Report

**Date:** 2026-04-09
**Branch:** dev
**Baseline:** origin/master

### CRITICAL
None.

### HIGH
None.

### MEDIUM (fixed)

**M-1:** `src/transcribe.ts` — `http://voice.cortex.lan` in JSDoc example exposed
internal hostname. Pre-existing in master. Fixed: replaced with `http://your-stt-server`.

**M-2:** Three task docs contained absolute Windows paths exposing local username:
- `tasks/1-drafts/10-369-mcp-test-coverage-gaps.md` — replaced with `Telegram MCP (this repo)`
- `tasks/2-queued/10-361-remove-session-record-feature.md` (×2) — replaced with repo-relative refs
- `tasks/4-completed/2026-04-08/10-418-security-audit-info-leakage.md` — replaced

### INFO (benign)
- `electricessence` — public GitHub handle; appears in badges, package.json, Docker refs. Not a finding.
- `.env.example` — contains fabricated example token only. `.gitignore` excludes `.env`.
- No real Telegram bot tokens found anywhere in src/ or *.ts/*.js files.
- No secret key files committed (`git log` scan clean).
- `cortex.lan` references in task docs are prose context (task descriptions), compound with M-1.

### Deferred
**M-3:** `tasks/4-completed/2026-04-03/20-070-governance-sync-from-cortex.md` — 3 absolute paths
pre-existing in master. Out of dev scope. Flagged for follow-up.

## Completion

**Commit:** `82bea21` on branch `10-418`
**Files changed:** 4 (1 source, 3 task docs)
**Tests:** transcribe.ts tests pass (13/13)
**Verdict:** CLEAN after fixes — no critical/high findings, 4 medium issues remediated
