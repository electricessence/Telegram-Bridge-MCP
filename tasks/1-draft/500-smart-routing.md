# Draft: Smart Routing (All Sessions Aware)

## Type

Feature / Future

## Status

**SUPERSEDED** — Routing has been simplified to governor-only. First session gets all ambiguous messages, delegates to workers. No need for all-session awareness. See `200-collapse-routing-modes.md` and `docs/multi-session-protocol.md`.

## Description

All sessions receive ambiguous messages but defer unless they're the right one to handle it. Sessions are aware of each other's context and can self-select.

## Notes

- Vision replaced by governor model with user-gated reroute on timeout
- May revisit if governor proves insufficient after dogfooding
