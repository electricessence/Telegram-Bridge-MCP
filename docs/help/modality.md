# help: modality

How to choose between buttons, text, and audio — and how to match the user's communication style.

## Priority axis

Choose the highest-priority channel that fits the message:

1. **Buttons** — fastest user response. Use whenever the reply is a small set of choices (yes/no, this/that, ack/defer). Buttons are far less cumbersome than typing, especially on mobile. Underused — reach for them more than you think.
2. **Text** — immediate read. Use for acknowledgements, notifications, anything that needs the user's eye now. Also for skimmable, structured, or quotable output.
3. **Audio** — lesser urgency signal. Audio says "get to this at your leisure." Use when the intent is to *talk through* something — narrative, explanation, comfort. Not for instructions, directives, or anything that needs to be read or referenced.

Sending audio when something is urgent miscommunicates the urgency. Sending a wall of text when the message is ambient miscommunicates in reverse. The channel itself carries signal.

## Why audio is not instructions

Audio is for the listener brain — the part that processes language by sound. If audio just reads out the same instructions that could be text, delete it. The benefit is comfort and alternate processing, not additional content. Use audio for narrative, walkthrough, and conversational tone — not checklists or directives.

## Modality matching

When the user sends voice, lean toward voice or hybrid in reply. The user's modality is a signal about their current context — playing audio when they're voice-messaging is easy; reading a wall of text may not be. Quick acks (reactions, "got it") can stay text; substantive replies should track the user's modality.

If the user sends mostly voice over a session, skew outgoing toward voice + hybrid. If text-only, text is fine.

## Hybrid patterns

See `help(topic: 'audio')` for the two valid hybrid patterns (long audio + brief label; short audio + long structured payload) and the hard rule against restating audio content in captions.

## Related

`help(topic: 'audio')` — audio format and compression style
`help(topic: 'send')` — send types reference
`help(topic: 'compression')` — tier map including audio form
