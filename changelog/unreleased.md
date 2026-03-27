# [Unreleased]

## Added

- **Streamable HTTP transport** — set `MCP_PORT` to run a shared HTTP server that multiple MCP clients can connect to simultaneously, instead of the default stdio transport. Each client gets its own isolated MCP session.
- `@types/express` added as a devDependency for proper type safety in HTTP handlers.
- `MCP_PORT` documented in `.env.example` and all setup/design docs.
- Claude Code setup instructions added to README (shared server mode section).

## Changed

- `httpTransports` uses `Map` instead of `Record` for session tracking (avoids `no-dynamic-delete` lint violations).
- `mcp-session-id` header normalized to handle `string | string[]` correctly.
- `app.listen` explicitly binds to `127.0.0.1` to prevent unintended network exposure.
- `MCP_PORT` validated at startup — invalid values cause a clear error and `process.exit(1)`.
- pnpm overrides pinned to specific patch versions instead of open-ended `>=` ranges.
- LOOP-PROMPT updated with PIN persistence and compaction recovery instructions.
