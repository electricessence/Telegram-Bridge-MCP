import { z } from "zod";

/**
 * Zod schema for the identity [sid, pin] parameter.
 *
 * Uses `z.array().length(2)` instead of `z.tuple()` because Zod's tuple
 * serialises to a `prefixItems` array that GitHub Copilot's JSON-Schema
 * validator rejects ("is not of type 'object', 'boolean'").
 * `z.array()` produces `{ items: { type: "integer" } }` which is valid.
 */
export const IDENTITY_SCHEMA = z
  .array(z.number().int())
  .length(2)
  .optional()
  .describe(
    "Identity tuple [sid, pin] from session_start. " +
    "Always required — pass your [sid, pin] on every tool call.",
  );
