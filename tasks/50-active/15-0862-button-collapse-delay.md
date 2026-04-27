---
id: 15-0862-button-collapse-delay
title: Add ~250ms delay between button click color-flip and message collapse
priority: 15
status: draft
type: ux
delegation: worker
repo: TMCP
---

# Add ~250ms delay between button click color-flip and message collapse

## Problem

When the operator clicks an inline keyboard button on a `choice` or `confirm` send, two things happen in rapid succession:

1. The button color flips to indicate selection (Telegram-side behavior).
2. The bridge collapses the inline keyboard into the chosen value, replacing the button row with the selected text in the message body.

The transition is functionally correct but feels rushed — the click acknowledgment and the collapse happen so close together that the visual feedback doesn't register as a discrete moment.

## Expected behavior

After the button is clicked:

1. Telegram-side color-flip fires immediately (no change here — already perfect).
2. Bridge waits ~250ms.
3. Bridge then performs the keyboard removal + value substitution in the message body.

The delay is short enough not to feel sluggish, long enough to register the click as a deliberate moment.

## Acceptance

- After a button click on `choice` / `confirm` / `acknowledge`-style sends, there is a ~250ms gap between the visual color-flip and the keyboard collapse.
- Behavior is the same across all interactive types that collapse keyboards.
- No new errors or race conditions if the operator clicks again within the delay window.
- Configurable threshold acceptable but a constant ~250ms is fine for v1.

## Don'ts

- Don't add the delay to the callback acknowledgment itself (must remain immediate per Telegram API expectations).
- Don't add the delay to non-interactive sends (no buttons to collapse).
- Don't make the delay so long that it feels sluggish (>500ms is too much).

## Notes

Operator-stated 2026-04-26 PM: "the whole experience is really awesome, but... can we add a quarter of a second delay to after the button is clicked before it actually collapses it up into the actual value inside the message?"

UX polish, not blocking. Pairs with the existing button + interactive-message infrastructure.

## Source

Operator directive 2026-04-26 evening via Curator session.
