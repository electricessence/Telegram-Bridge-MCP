# Token Cost Analysis — Telegram Bridge MCP

> **Purpose:** An honest study of how using this MCP affects the token consumption of an AI agent, what patterns are cheap, what patterns are expensive, and what decisions were made as a result.

---

## Background

Every tool call an agent makes has a token cost composed of three parts:

1. **Tool schema overhead** — the tool's name, description, and parameter definitions are injected into the context on every turn. This is a fixed per-session cost.
2. **Tool call arguments** — the text the agent writes when invoking the tool (e.g. the message body, parameters).
3. **Tool result** — the response returned to the agent and inserted into the context.

All three accumulate in the context window and are re-submitted to the model on each subsequent turn. This means token costs are **cumulative**, not per-call.

---

## 1. Schema Overhead (Fixed Cost per Session)

Every registered MCP tool contributes its full name + description + parameter schema to the system prompt on every inference call. This cost is constant regardless of how many tools are actually invoked.

### Measurement (v1.12.0, 35 tools)

A rough token count of all tool definitions in this MCP:

| Category | Tools | Approx. tokens |
| --- | --- | --- |
| Messaging (send_message, notify, ask, choose, etc.) | 10 | ~2,000 |
| Polling (wait_for_message, get_update, get_updates) | 3 | ~900 |
| Media (photo, video, audio, document, voice) | 5 | ~1,000 |
| Interaction (confirmation, buttons, reaction, etc.) | 7 | ~1,050 |
| Status / utility (update_status, show_typing, etc.) | 6 | ~600 |
| Admin / misc (restart, agent guide, get_me, etc.) | 4 | ~350 |
| **Total** | **35** | **~5,900 tokens** |

**~5,900 tokens** are added to every context window purely from tool definitions, before the agent does anything. On a model charging $3/M tokens (input), this is ~$0.02 per session — negligible for a long session, significant if sessions are very short.

### What this means

If you only need a subset of tools for a given agent, a stripped-down configuration with fewer registered tools meaningfully reduces per-call overhead. For power users with long sessions, the full schema amortizes well.

---

## 2. Tool Call Argument Cost (Variable)

When the agent invokes a tool, it writes the arguments as tokens. For text-sending tools, the dominant cost is the **message body** itself — the same text the agent would write in a direct response.

### Key insight: arguments ≈ the message itself

```ts
send_message(text="Here is my answer to your question...") 
```

The token count of the `text` argument is essentially the same as if the agent had responded directly. There is a small fixed overhead per call (~10–20 tokens for the JSON wrapper and tool name), but it is negligible.

**Net overhead of a single `send_message` call over a direct LLM response: ~1–2%.**

---

## 3. Tool Result Cost (Variable)

The tool result is injected back into the context. Results vary widely:

| Tool | Typical result size | Notes |
| --- | --- | --- |
| `send_message` | ~50 tokens | `{ ok: true, message_id: 123, ... }` |
| `notify` | ~50 tokens | Same |
| `wait_for_message` | ~100–300 tokens | Contains full sanitized message object |
| `get_update` | ~100–400 tokens | One sanitized update + remaining count |
| `get_updates` | ~100–2,000 tokens | N updates × ~200 tokens each |
| `send_photo` / media | ~80 tokens | File ID + metadata |
| `ask` / `choose` | ~100–300 tokens | Includes user's reply |

Results also accumulate in context. In a long session with 50 tool calls, the results alone can add **5,000–15,000 tokens** to the context, which are re-submitted on every subsequent turn.

---

## 4. The Streaming Problem — Why We Don't Auto-Stream

### The O(N²) explosion

`sendMessageDraft` requires the **full accumulated text** on every call — there is no delta/append mode. If an agent simulates token-by-token streaming by calling the tool on each token:

$$\text{total argument tokens} = \sum_{i=1}^{N} i = \frac{N(N+1)}{2}$$

For a 500-token response:

| Approach | Tokens consumed |
| --- | --- |
| `send_message` (one call) | ~520 tokens |
| 10-step milestone drafts | ~5,200 tokens (10×) |
| 50-step fine drafts | ~13,000 tokens (25×) |
| Token-by-token (500 calls) | ~125,250 tokens (241×) |

Token-by-token streaming is **241× more expensive** than a single `send_message`. It would cost ~$0.38 on a $3/M token model just for one streamed response.

### What we actually built

`send_message_draft` is exposed as a **raw primitive tool**. The description explicitly warns agents against calling it in a loop and explains the cost model. A server-side automatic typewriter wrapper was considered and rejected because:

1. It would transmit N × growing text payloads to Telegram's servers (Telegram uses full replacement, not delta patching).
2. There is no evidence Telegram compresses or deduplicates on their end.
3. The cosmetic benefit (text appearing progressively) does not justify the infrastructure cost for what is currently a promotional API feature.

**Verdict:** `send_message_draft` is available for deliberate milestone use (e.g. "here's what I've found so far" partway through a long task). Automatic typewriter streaming is not offered.

---

## 5. Context Accumulation in Long Sessions

In a typical loop session (wait → respond → wait → respond…), the context window grows continuously:

```text
Turn 1:  schema(6,600) + system(~500) + user_msg(200) + tool_call(300) + tool_result(100)
Turn 2:  turn_1(7,700) + user_msg(200) + tool_call(300) + tool_result(100)
Turn 3:  turn_2(8,300) + user_msg(200) + tool_call(300) + tool_result(100)
...
Turn N:  (~7,700 + (N-1) × 900) tokens
```

After 50 turns, the context is ~**52,000 tokens** even for simple short messages. This is an inherent property of stateful LLM sessions, not specific to this MCP.

### Mitigation patterns

- **Summarize aggressively** between major task boundaries. A 50-turn context can often be summarized into ~500 tokens.
- **Use `get_update` over `get_updates`** for routine polling — it returns one update at a time with a smaller result payload, rather than potentially dumping all buffered messages at once.
- **Prefer `notify` over `send_message` for status updates** — same token cost but semantically clearer, reducing the chance the agent re-reads it as content requiring a response.
- **Don't log intermediate tool results you won't use** — if you call `show_typing`, its `true` result doesn't need to be referenced again. It still sits in context though.

---

## 6. Cost Comparison: MCP vs Direct API

For a developer considering whether to use this MCP vs writing a bot directly:

| Aspect | Direct bot code | Telegram Bridge MCP |
| --- | --- | --- |
| Tool schema overhead | 0 | ~6,600 tokens/session |
| Per-message call overhead | 0 | ~20 tokens |
| Context growth per turn | N/A | ~900 tokens/turn |
| Agent capability | Code only | Any MCP-capable model |
| Latency per tool call | N/A | ~1–2 RTTs (stdio + HTTPS) |

The MCP overhead is real but modest for sessions longer than a few turns. The break-even point vs a custom-coded bot is essentially "turn 1" — the MCP enables capabilities (interactive confirmation, voice transcription, dynamic choice menus) that would require significant coding otherwise.

---

## 7. Recommendations for Cost-Conscious Use

1. **One outbound tool call per agent turn.** Don't chain `show_typing` → `send_message` → `set_reaction` unless each is genuinely needed. Each call adds ~100–200 tokens to the permanent context.

2. **Use `send_confirmation` / `choose` instead of `ask`** when the answer space is known. Button responses are shorter than typed text, reducing the result payload.

3. **Avoid `get_updates` in normal flow.** It can return many buffered updates at once. Use `get_update` (singular) instead — process one, check `remaining`, repeat. Smaller individual payloads.

4. **Don't use `send_message_draft` in loops.** The warning is in the tool description, but worth repeating here: even at 10 milestone calls for a 500-token response, you're spending 10× the tokens vs a single `send_message`. Use it only when the UX benefit clearly justifies it (e.g. a long-running research task where the user would otherwise see nothing for minutes).

5. **Restart sessions for unrelated tasks.** Tool results from a previous task sit in context forever. A fresh session for an unrelated task starts with only the 6,600-token schema overhead instead of carrying 40,000 tokens of prior conversation.

---

## 8. Estimated Session Costs

Representative costs at $3/M input + $15/M output (approximating Claude Sonnet pricing as of early 2026):

| Session type | Turns | Approx. tokens | Approx. cost |
| --- | --- | --- | --- |
| Short Q&A (5 turns) | 5 | ~12,000 | ~$0.04 |
| Medium task (20 turns) | 20 | ~26,000 | ~$0.09 |
| Long session (50 turns) | 50 | ~52,000 | ~$0.18 |
| Long session + streaming (50 turns, 10 drafts/msg) | 50 | ~250,000 | ~$0.88 |

The streaming case demonstrates why the automatic typewriter wrapper was rejected. At 10 milestone drafts per message it adds 5× cost to a long session — and that's a conservative estimate.

---

*Last updated: March 2026. Tool count and schema sizes based on v1.12.0.*
