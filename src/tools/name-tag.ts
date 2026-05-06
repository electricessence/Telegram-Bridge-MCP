import { toResult, toError } from "../telegram.js";
import { requireAuth } from "../session-gate.js";
import { getSession, type Session } from "../session-manager.js";

/**
 * Resolve the effective name tag for a session.
 * Returns the explicit `name_tag` override if set, otherwise the auto-default
 * (`<color> <name>` when a color is assigned, or just `<name>`).
 *
 * Exported for reuse by outbound-proxy.ts (buildHeader).
 */
export function resolveNameTag(session: Session, sid: number): string {
  const resolvedName = session.name || `Session ${sid}`;
  return session.name_tag ?? (session.color ? `${session.color} ${resolvedName}` : resolvedName);
}

/**
 * Validate a candidate name_tag string.
 * Returns an error message string, or null if valid.
 */
export function validateNameTag(value: string): string | null {
  if (value.includes("\n")) return "name_tag must not contain newlines.";
  if (value.includes("`")) return "name_tag must not contain backticks.";
  if (value.length > 64) return "name_tag exceeds 64 characters.";
  return null;
}

/**
 * Get or set the session name tag.
 *
 * GET (no `name_tag`): returns the effective name tag — explicit override if
 *   set, otherwise the auto-default `<color> <name>` (or just `<name>`).
 *
 * SET (with `name_tag`): validates and stores the override. Pass an empty
 *   string to reset to the auto-default.
 */
export function handleNameTag({ token, name_tag }: { token: number; name_tag?: string }) {
  const sid = requireAuth(token);
  if (typeof sid !== "number") return toError(sid);

  const session = getSession(sid);
  if (!session) return toError({ code: "SESSION_NOT_FOUND" as const, message: "Session not found." });

  if (name_tag !== undefined) {
    if (name_tag.length > 0) {
      const err = validateNameTag(name_tag);
      if (err !== null) return toError({ code: "INVALID_NAME_TAG" as const, message: err });
    }
    // Empty string resets to default (undefined = auto-compute)
    session.name_tag = name_tag.length > 0 ? name_tag : undefined;
  }

  return toResult({ name_tag: resolveNameTag(session, sid), custom: session.name_tag !== undefined });
}
