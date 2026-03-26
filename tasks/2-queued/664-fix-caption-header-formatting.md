# 664 — Fix Caption Header Formatting

| Field    | Value        |
| -------- | ------------ |
| Created  | 2026-03-26   |
| Priority | high         |
| Scope    | Telegram MCP |

## Problem

In multi-session mode, the session nametag in file captions (photo/video/audio/document) renders as plain unformatted text instead of with code formatting. Text messages correctly use the `formatted` header and auto-inject `parse_mode`, but file captions use the `plain` header and don't auto-inject `parse_mode`.

## Root Cause

In `src/outbound-proxy.ts`, the file send proxy (around line 270-274):

```typescript
const { plain: captionHeader } = buildHeader(parseMode);
if (captionHeader && optsArg?.caption) {
  (args[2] as Record<string, unknown>).caption =
    captionHeader + (optsArg.caption as string);
}
```

Issues:
1. Uses `plain` header (no formatting) instead of `formatted` (with code tags)
2. Does not auto-inject `parse_mode` when a header is added but no parse_mode is set

Compare with the text message proxy (working correctly):

```typescript
const { plain: headerPlain, formatted: headerFormatted } = buildHeader(parseMode);
const finalText = headerFormatted ? headerFormatted + text : text;

if (headerFormatted && !parseMode) {
  finalOpts = { ...cleanOpts, parse_mode: "Markdown" };
  parseMode = "Markdown";
}
```

## Fix

In `src/outbound-proxy.ts`, in the file send proxy section, change the caption header injection to:

```typescript
// Inject session header into caption if multi-session active
const optsArg = args[2] as Record<string, unknown> | undefined;
let parseMode = optsArg?.parse_mode as string | undefined;
const { plain: captionHeaderPlain, formatted: captionHeaderFormatted } = buildHeader(parseMode);
if (captionHeaderFormatted && optsArg?.caption) {
  // Auto-inject parse_mode so backtick name tag renders
  if (!parseMode) {
    (args[2] as Record<string, unknown>).parse_mode = "Markdown";
    parseMode = "Markdown";
  }
  (args[2] as Record<string, unknown>).caption =
    captionHeaderFormatted + (optsArg.caption as string);
} else if (captionHeaderPlain && optsArg?.caption) {
  // Fallback: plain header when formatted is empty
  (args[2] as Record<string, unknown>).caption =
    captionHeaderPlain + (optsArg.caption as string);
}
```

Wait — `buildHeader` returns `formatted` as non-empty only when `name` is non-empty AND `activeSessionCount() >= 2`. If `formatted` is empty, `plain` is also empty. So the `else if` branch is unreachable. Simplify to:

```typescript
const optsArg = args[2] as Record<string, unknown> | undefined;
let parseMode = optsArg?.parse_mode as string | undefined;
const { plain: captionHeaderPlain, formatted: captionHeaderFormatted } = buildHeader(parseMode);
if (captionHeaderFormatted && optsArg?.caption) {
  if (!parseMode) {
    (args[2] as Record<string, unknown>).parse_mode = "Markdown";
    parseMode = "Markdown";
  }
  (args[2] as Record<string, unknown>).caption =
    captionHeaderFormatted + (optsArg.caption as string);
}
```

**Important**: The `parseMode` variable was previously `const` — it must become `let` since we now mutate it. And the existing line `const parseMode = optsArg?.parse_mode as string | undefined;` needs to become `let parseMode`.

Also: the recording section afterwards uses `finalCaption` from `(args[2]...)?.caption` — this already reads the modified caption, so the recording will contain the formatted header. For recording we want the plain version. But looking at the text message path, it records `finalRawText` (which uses the `plain` header). The file caption recording currently records the modified caption directly. This is fine for now — the recording doesn't need to precisely match.

## Tests

In `src/outbound-proxy.test.ts`, find the existing tests for file sends with captions. There should be tests like "prepends caption header in multi-session mode". Update or add:

1. **"uses formatted header in file caption"**: Verify that when a caption is set and multi-session is active, the formatted header (with Markdown backtick formatting) is prepended, not the plain header.
2. **"auto-injects parse_mode Markdown for caption header"**: When no `parse_mode` is set on the options but a caption exists and multi-session is active, verify `parse_mode: "Markdown"` is injected.
3. **"preserves existing parse_mode for caption header"**: When `parse_mode: "HTML"` is already set, verify the HTML-formatted header is used and parse_mode is not overridden.

## Changelog

Add to `changelog/unreleased.md`:

```markdown
## Fixed

- Session nametag in file captions now renders with proper code formatting instead of plain text
```

## Acceptance Criteria

- [ ] File captions use `formatted` header (with code tags) matching the file's parse_mode
- [ ] Auto-inject `parse_mode: "Markdown"` when a header is added but no parse_mode exists
- [ ] Existing tests still pass
- [ ] New tests verify formatted header and parse_mode injection
- [ ] `pnpm build` clean
