import { z } from "zod";

/**
 * Zod schema for the identity [sid, pin] parameter.
 *
 * Uses z.preprocess() to handle the common agent mistake of passing
 * identity as a JSON string (e.g., "[2, 573602]") instead of an array.
 * Parseable strings are silently coerced; non-parseable values pass
 * through to the inner schema for normal rejection.
 *
 * Uses `z.array()` without a length constraint because both `z.tuple()` and
 * `z.array().length(N)` cause the MCP SDK to emit `items: [schema, schema]`
 * (an array), which the GitHub Copilot JSON-Schema validator rejects as
 * "not of type 'object', 'boolean'". A plain array schema emits
 * `{ type: "array", items: { type: "integer" } }` which is valid.
 * Length is enforced at runtime by `requireAuth` — a short array produces
 * `pin === undefined`, which fails `validateSession` with AUTH_FAILED.
 */
export const IDENTITY_SCHEMA = z
  .preprocess(
    (val) => {
      if (typeof val === "string") {
        try {
          const parsed: unknown = JSON.parse(val) as unknown;
          if (Array.isArray(parsed)) return parsed as number[];
        } catch { /* fall through — let inner schema reject */ }
      }
      return val;
    },
    z.array(z.number().int()).optional(),
  )
  .describe(
    "Identity tuple [sid, pin] from session_start. " +
    "Always required — pass your [sid, pin] on every tool call.",
  );
