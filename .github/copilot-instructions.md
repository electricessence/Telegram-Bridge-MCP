# Telegram Bridge MCP — Workspace Instructions

This repository **is** the Telegram Bridge MCP server. Edits to `src/` directly
change the running MCP server.

## Changelog Maintenance

**Every commit that changes behavior must update
[changelog/unreleased.md](../changelog/unreleased.md).**

- [Keep a Changelog](https://keepachangelog.com) format
- Categories: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Deprecated`
- One line per change, past tense
- Include in the same commit as the code change — never a separate commit

## Pull Request Merge Policy

All PRs from `dev` to `master` **must use squash-and-merge** — never a regular
merge or rebase. This collapses the full commit history into a single clean
commit on `master`.
