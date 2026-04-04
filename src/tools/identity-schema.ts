import { z } from "zod";

/**
 * Human-readable description for the `token` parameter used in all tool schemas.
 */
export const TOKEN_PARAM_DESCRIPTION =
  "Session token from session_start (sid * 1_000_000 + pin). " +
  "Always required — pass your token on every tool call.";

// ---------------------------------------------------------------------------
// Token string-coercion hint
// ---------------------------------------------------------------------------

/**
 * Module-level flag: set to true when the most recent TOKEN_SCHEMA parse
 * received a string digit instead of an integer. Consumed by
 * `consumeTokenStringHint()`.
 *
 * Safe for stdio (one tool call at a time). For HTTP transport with
 * concurrent tool calls from different sessions, replace with
 * AsyncLocalStorage — concurrent parses would race and corrupt this flag.
 */
let _tokenWasString = false;

/**
 * Returns a hint string if the last token parse coerced a string to an integer,
 * then resets the flag. Returns undefined if the token was already an integer.
 *
 * Call this in tool handlers that want to nudge the LLM toward passing the
 * correct type. Currently used by `dequeue_update` and `session_start`.
 */
export function consumeTokenStringHint(): string | undefined {
  if (_tokenWasString) {
    _tokenWasString = false;
    return "token was passed as a string — use a plain integer for better performance";
  }
  return undefined;
}

/**
 * Zod schema for the `token` parameter.
 *
 * A single integer encoding both the session ID and PIN:
 *   token = sid * 1_000_000 + pin
 *
 * Accepts both plain integers and numeric strings (e.g. "10982170") — the
 * latter are coerced to integer via `z.preprocess`. The JSON Schema output
 * still produces `type: "integer"` so OpenAI-style validators stay happy.
 *
 * Use `decodeToken(token)` to extract `{ sid, pin }`.
 */
export const TOKEN_SCHEMA = z
  .preprocess(
    (v) => {
      _tokenWasString = typeof v === "string" && /^\d+$/.test(v as string);
      return _tokenWasString ? parseInt(v as string, 10) : v;
    },
    z.number().int().positive(),
  )
  .describe(TOKEN_PARAM_DESCRIPTION);

/**
 * Decode a session token into its constituent sid and pin.
 *
 * @param token  Positive integer: sid * 1_000_000 + pin
 * @returns      { sid, pin }
 */
export function decodeToken(token: number): { sid: number; pin: number } {
  const pin = token % 1_000_000;
  const sid = Math.floor(token / 1_000_000);
  return { sid, pin };
}

// ---------------------------------------------------------------------------
// Legacy alias — kept so that any code that still imports IDENTITY_SCHEMA
// continues to compile while the migration is in progress.
// Remove once all callers are updated.
// ---------------------------------------------------------------------------
/** @deprecated Use TOKEN_SCHEMA instead */
export const IDENTITY_SCHEMA = TOKEN_SCHEMA;
