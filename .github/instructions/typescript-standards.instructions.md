---
applyTo: "**/*.ts"
---
# TypeScript Coding Standards

Lessons learned from active development on this codebase. Rules are stated with their *reason* — understanding the why prevents the category of bug, not just the specific instance.

---

## Control Flow

**Guard-clause / positive-first** — Check the success condition and return early. This keeps the happy path un-indented and errors co-located with their cause. Nested `if/else` where the `if` body always returns is a code smell.

**Single condition per guard** — If one boolean already captures the failure state, don't AND a redundant second check. Extra conditions hide intent and create silent gaps when the second check is wrong.

**Ternary for value selection, guard for flow** — Use a ternary (`a ? b : c`) to select between two values. Use a guard clause (`if (!x) return`) to exit a scope. Don't use ternaries for side effects.

---

## Types

**No `!` non-null assertions (null-forgiving operator)** — The postfix `!` tells the compiler "trust me, this isn't null" without any runtime guarantee. It silences the error by lying about the type. The correct fix is to narrow with a runtime check or change the type signature. Every `!` is a bet that will eventually lose.

**No `as any`** — Casts to `any` remove all type safety downstream. Use a named interface/type alias, proper narrowing, or the real library type. If a library type is incomplete, cast to a narrow intermediate type, not `any`.

**Numeric sentinel `0` for "not set"** — Use `0` instead of `null` or `NaN` for optional numeric IDs. `NaN` causes subtle bugs (`NaN !== NaN`); `null` forces null-checks everywhere. `0` is falsy, compares cleanly with `> 0`, and makes intent obvious: "0 means no filter".

**`Promise<boolean>` for "try" helpers** — A function that attempts something and swallows errors should return `Promise<boolean>` using `.then(() => true, () => false)`. `void` + `.catch(() => {})` is fire-and-forget with no feedback; callers lose the ability to react to failure even if they want to.

---

## Singletons & Assignment

**`??=` for lazy init** — Combines the null-check and assignment into one expression. Prefer inline return-assignment: `return (_val ??= init())`.

**`throw` instead of `process.exit`** — Fatal configuration errors in library/tool code should `throw new Error(...)`. This allows callers and tests to catch the error cleanly. `process.exit` is acceptable only in a true top-level startup entrypoint.

---

## Regex

**All regex literals → named module-level constants** — Inline regexes are invisible (no name, no searchability) and get re-compiled on every call in some JS engines. Naming them documents intent and makes them findable. Place them in a grouped constant block at the top of the file.

**Use `+` when stripping repeated characters** — `/\/+$/` strips one-or-more trailing slashes; `/\/$/` only strips one. The `+` is almost always what you actually want for trimming operations.

**Non-global regex for `.test()`** — A regex with the `g` flag advances `lastIndex` on each `.test()` call. For a single-match test, omit `g` to prevent stateful bugs between calls.

---

## Style

**Lines ≤ 100 characters** — Enforced. Long lines hide logic in horizontal scroll.

**Vertical dot chains** — Multi-step promise chains go one method per line. This makes the sequence of operations readable and diffs cleaner.

**Extract booleans before using in conditions** — Name the boolean before the `if`. `const hasFilter = userId > 0; if (!hasFilter && …)` is readable. `if (!(userId > 0) && …)` is not.

**Named intermediate variables over inline expressions** — If an expression is more than a simple property access or comparison, assign it to a named `const` first. This is especially true for mutations (e.g. `host = host.replace(…)` then use `host`).

**Expand multi-property returns vertically** — Object literals with long values go one property per line. This makes property names scannable and reduces merge conflicts.

---

## Module Structure

**Shared Telegram API wrappers belong in `telegram.ts`** — If a helper wraps a grammy API call and multiple files need it, export it from `telegram.ts` rather than duplicating or scattering it.

**Extract type aliases for long generic types** — `type ASRPipeline = AutomaticSpeechRecognitionPipeline` is more readable than the full name at every usage site. Export the alias if other files need it.

**Named constants for emoji/encoded values** — When a string must be a member of a narrow union type (e.g. `ReactionEmoji`), store it as a typed constant with a unicode escape and a comment: `const REACT_DONE = "\uD83E\uDEE1" as ReactionEmoji; // 🫡`. This keeps the source font-independent while retaining readability.

---

## Consistency — Propagate Changes

**When a suggestion applies to one place, look for every other place it applies.** If a field is changed to a more precise type, scan the whole file (and consumers) for every usage. If a pattern is introduced (named regex, typed constant, guard clause), check all similar constructs in the same file. A partial fix creates inconsistency that confuses the next reader.

---

## Validation Functions

Return `Type | null` where `null` means "valid" — this is the pattern used throughout the codebase. Check the passing condition first and return `null`, then return the error. This keeps the function readable without double-negatives.
