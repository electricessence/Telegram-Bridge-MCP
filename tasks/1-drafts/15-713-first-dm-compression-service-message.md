# 15-713 - First-DM service message: teach ultra-compression by example

## Context

Operator (2026-04-19): when an agent DMs another session for the first time in a session, TMCP should emit a service message reminding them to use ultra-compression for inter-agent communication, with `help('compression')` as the breadcrumb. After receiving the service message once, the agent self-regulates for the rest of the session.

This is the broader pattern of behavior shaping at the protocol layer rather than per-agent memory. Lazy-load the rule when it becomes relevant (first DM), don't bloat startup-context with rules that may never apply.

## Acceptance Criteria

1. **Trigger:** first time a session emits `send` with `type: "dm"` (or any inter-session DM path) within a session.
2. **Service message** appended to that session's next dequeue:
   - Short, ASCII-clean: "Inter-agent DMs should use ultra-compression. See `help('compression')` for the framework. Operator-facing messages are full-tier; agent-facing are ultra-tier."
   - `event_type: "compression_hint_first_dm"` (or similar — pick a stable event type for telemetry).
3. **Once per session.** Don't re-emit on subsequent DMs in the same session.
4. **No effect on operator-facing `send`.** This is strictly for inter-session DMs.

## Constraints

- Service message text stays under ~200 chars. Brevity is part of the lesson.
- `help('compression')` topic must exist (it does per recent compression-as-talent work; verify before shipping).
- Don't piggyback on the unrenderable-chars warning system — separate event_type.

## Open Questions

- Should this also fire on the first `message/route`? Probably yes, same intent.
- Per-session or per-target-pair? Per-session is simpler; per-target-pair more pedagogical. Default: per-session.

## Delegation

Worker (TMCP). Curator stages, operator merges.

## Priority

15 - behavior shaping. Not blocking, but fixes a recurring "agent DMs are too long" friction.

## Related

- Memory: `feedback_compression_as_talent.md`, `feedback_lazy_load_service_msgs.md`.
- Architectural cousin: any future "first-time-X-do-Y" service messages follow the same lazy-load pattern.
