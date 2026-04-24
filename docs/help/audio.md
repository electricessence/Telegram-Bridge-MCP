# help: audio

Voice notes are excellent for operator-facing communication. Use them when the intent is to *talk through* something — explain, narrate, walk through context. Not for structured information transfer (use text + buttons for that).

## Compression tier

Audio uses its own compression form. **Not terse — fluid.** Text compression removes words; audio compression is structural: conversational, not choppy, not punchy, not bullets. Audio uses its own compression form — not placed on the Lite/Full/Ultra scale. Audio compresses by being structurally fluid, not by removing words. The listener should unpack effortlessly.

## Hybrid patterns (audio + text)

Two valid patterns:

1. **Long fluid audio + brief caption**: Audio carries plain-language explanation. Caption is a short topic label — what the audio is about, not what it says.
2. **Short audio + long structured text**: Audio orients ("here's what's in the breakdown"). Text carries the detailed checklist, table, or payload.

**Anti-pattern (hard rule):** Never send the same content in both audio and caption. Not even paraphrased. Telegram may transcribe voice notes automatically — caption restatement adds noise. The caption's job is something the audio cannot do (topic label, structured payload, link). If the caption just restates the audio, delete it.

See also: `help(topic: 'compression')`, `help(topic: 'send')`
