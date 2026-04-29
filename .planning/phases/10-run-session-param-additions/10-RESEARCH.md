# Phase 10: Run + Session Param Additions - Research

**Researched:** 2026-04-29
**Domain:** TypeScript SDK type extension — additive prompt body fields and session creation body fields
**Confidence:** HIGH

## Summary

Phase 10 is a low-risk additive change to two existing tools: `prefect_run` and `prefect_create_session`. All five requirements (RUN-05 through RUN-08, SESSION-10) map directly to fields already present in the SDK's generated types — no new SDK methods, no new HTTP endpoints, no architectural changes. The work is purely: extend Zod schemas, extend the `RunPromptOptions` interface in `src/handlers.ts`, thread the new fields through `runPrompt()`, and extend the `createSession()` call to accept `parentID`.

The key concern from STATE.md ("RUN-05 tools override: verify the exact field name and type") is now fully resolved. The `tools` field on the prompt body is `{ [key: string]: boolean }` — a record mapping tool ID strings to boolean enable/disable flags, NOT a `string[]` array. This is the most important finding: the Zod schema must be `z.record(z.string(), z.boolean())`, not `z.array(z.string())`.

Both `SessionPromptData` (sync) and `SessionPromptAsyncData` (async) share identical body shapes, so all four new `prefect_run` fields apply symmetrically to `prefect_prompt_async`. The planner should decide whether to extend `prefect_prompt_async` as well — it is out of scope per the requirements list but the code surface is identical.

**Primary recommendation:** Extend `RunPromptOptions` in `src/handlers.ts` with the four new optional fields, thread them through `runPrompt()`, extend `prefect_run`'s Zod input schema, extend `createSession()` and `prefect_create_session` with `parentID`. One plan is sufficient — all five changes are in the same two files (`src/handlers.ts` and `src/index.ts`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tools override (RUN-05) | API / Backend | — | Sent in prompt body; OpenCode enforces which tools are active |
| File attachments (RUN-06) | API / Backend | — | Sent as parts array elements in prompt body |
| Message resume (RUN-07) | API / Backend | — | Sent as `messageID` in prompt body; OpenCode handles replay |
| Agent/Subtask structured inputs (RUN-08) | API / Backend | — | Sent as parts array elements of type "agent" or "subtask" |
| Session parent hierarchy (SESSION-10) | API / Backend | — | Sent in session create body; OpenCode tracks parentID on Session |

All five capabilities are owned entirely by the API/Backend tier. The MCP layer is a thin pass-through. No client-side logic is required beyond schema validation and serialization.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | existing | Input schema validation for new fields | Already used throughout src/index.ts |
| @opencode-ai/sdk | existing | SDK client — no new methods needed | SessionPromptData already has all new fields |

No new dependencies required for this phase.

**Version verification:** No new packages to install.

## Architecture Patterns

### System Architecture Diagram

```
MCP Tool Call (prefect_run)
    │
    ▼
Zod schema validation (src/index.ts)
    │  new fields: tools, files, messageID, agentInput, subtaskInput
    ▼
runPrompt() in src/handlers.ts
    │  extends body: spreads new optional fields into parts array / top-level body fields
    ▼
client.session.prompt() [SDK]
    │  POST /session/:id/message
    │  body: { parts: [...], tools?: {...}, messageID?: string, ... }
    ▼
OpenCode HTTP API
    │  returns { info: AssistantMessage, parts: Part[] }
    ▼
PartSchema.array().parse() → structured response → MCP caller
```

```
MCP Tool Call (prefect_create_session)
    │
    ▼
Zod schema validation (src/index.ts)
    │  new field: parentID
    ▼
createSession() in src/handlers.ts
    │  extends body: { title, parentID }
    ▼
client.session.create() [SDK]
    │  POST /session
    │  body: { title?, parentID? }
    ▼
OpenCode HTTP API → returns Session (with parentID field)
```

### Recommended Project Structure

No structural changes. All edits are in existing files:

```
src/
├── handlers.ts    # Extend RunPromptOptions + runPrompt() + createSession()
└── index.ts       # Extend prefect_run and prefect_create_session Zod schemas
```

### Pattern 1: Extending RunPromptOptions and the prompt body

**What:** Add four new optional fields to `RunPromptOptions`, thread them into the `runPrompt()` body. The `tools` field goes at the top level of the body. The `files`, `agentInput`, and `subtaskInput` fields are appended as additional elements in the `parts` array alongside the existing `TextPartInput`.

**When to use:** Any time a caller wants to constrain tools, attach files, resume from a message, or send structured multi-agent inputs.

**How the parts array is built:**

```typescript
// Source: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts (SessionPromptData)
// parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>

const parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput> = [
  { type: 'text', text: prompt },
  ...(opts.files ?? []),
  ...(opts.agentInput ? [opts.agentInput] : []),
  ...(opts.subtaskInput ? [opts.subtaskInput] : []),
];
```

**How tools and messageID are sent (top-level body fields, not in parts):**

```typescript
// Source: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts (SessionPromptData)
body: {
  parts,
  ...(opts.model ? { model: opts.model } : {}),
  ...(opts.agent ? { agent: opts.agent } : {}),
  ...(opts.system ? { system: opts.system } : {}),
  ...(opts.tools ? { tools: opts.tools } : {}),         // { [key: string]: boolean }
  ...(opts.messageID ? { messageID: opts.messageID } : {}),
}
```

### Pattern 2: Extending createSession() with parentID

**What:** `SessionCreateData.body` has `{ parentID?: string; title?: string }`. The current `createSession()` only passes `title`. Add `parentID` as an optional parameter.

```typescript
// Source: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts (SessionCreateData)
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,            // NEW
): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await client.session.create({
    body: {
      title,
      ...(parentID ? { parentID } : {}),   // NEW
    },
    query: directory ? { directory } : undefined,
  });
  ...
}
```

### Pattern 3: Zod schemas for new fields

**RUN-05 tools override — CRITICAL: this is a record, not an array:**

```typescript
// Source: types.gen.d.ts UserMessage.tools and SessionPromptData.body.tools
// tools?: { [key: string]: boolean }
tools: z.record(z.string(), z.boolean()).optional()
  .describe('Override enabled tools for this call. Map of tool ID → true/false. Example: { "bash": true, "edit": false }')
```

**RUN-06 files — FilePartInput shape:**

```typescript
// Source: types.gen.d.ts FilePartInput
// { id?: string; type: "file"; mime: string; filename?: string; url: string; source?: FilePartSource }
files: z.array(z.object({
  type: z.literal('file'),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
})).optional()
  .describe('File attachments to include as context. Each file requires mime type and url.')
```

**RUN-07 messageID:**

```typescript
// Source: types.gen.d.ts SessionPromptData.body.messageID
messageID: z.string().optional()
  .describe('Resume the session from this message ID rather than appending to the end.')
```

**RUN-08 agentInput and subtaskInput:**

```typescript
// Source: types.gen.d.ts AgentPartInput, SubtaskPartInput
agentInput: z.object({
  type: z.literal('agent'),
  name: z.string(),
}).optional()
  .describe('Structured agent part input — specify the agent name for this prompt.')

subtaskInput: z.object({
  type: z.literal('subtask'),
  prompt: z.string(),
  description: z.string(),
  agent: z.string(),
}).optional()
  .describe('Structured subtask part input — delegate a subtask to a specific agent.')
```

**SESSION-10 parentID:**

```typescript
// Source: types.gen.d.ts SessionCreateData.body.parentID
parentID: z.string().optional()
  .describe('Parent session ID — creates this session as a child of the given parent for hierarchy tracking.')
```

### Anti-Patterns to Avoid

- **`tools` as a string array:** The SDK type is `{ [key: string]: boolean }`, not `string[]`. A `z.array(z.string())` schema would be wrong and break at runtime. Use `z.record(z.string(), z.boolean())`.
- **Putting tools/messageID in the parts array:** These are top-level body fields, not parts. Only `FilePartInput`, `AgentPartInput`, and `SubtaskPartInput` go in the parts array.
- **Putting TextPartInput in files/agentInput/subtaskInput params:** The caller passes a plain `string` prompt; the handler constructs the `TextPartInput` `{ type: 'text', text: prompt }` internally. The new params add to the parts array after the text part.
- **Forgetting to extend `prefect_prompt_async` body:** The same `SessionPromptAsyncData` body shape applies. Whether to extend `prefect_prompt_async` is a planner decision (not in Phase 10 requirements, but easy to add at the same time if desired).
- **Modifying `createSession()` signature in a breaking way:** Composite tools `prefect_delegate` and `prefect_dispatch` call `createSession()` directly. Adding `parentID` as a trailing optional parameter is safe; restructuring as an options object would require updating callers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| tools record type | Custom type guard | `z.record(z.string(), z.boolean())` | SDK type is exactly `{ [key: string]: boolean }` |
| FilePartInput schema | Custom parser | Match `FilePartInput` from types.gen.d.ts | SDK already defines the exact shape |
| AgentPartInput/SubtaskPartInput | Custom shape | Match SDK types exactly | Deviation causes 400 errors from OpenCode |

## Common Pitfalls

### Pitfall 1: tools field type mismatch
**What goes wrong:** Using `z.array(z.string())` for the `tools` param instead of `z.record(z.string(), z.boolean())`.
**Why it happens:** The requirement says "tools array" and the MCP tool description uses the word "array." But the SDK type is a boolean map.
**How to avoid:** Use `z.record(z.string(), z.boolean())`. Verify against `SessionPromptData.body.tools` in types.gen.d.ts.
**Warning signs:** TypeScript compiler error when passing the value to `client.session.prompt()`.

### Pitfall 2: FilePartInput requires `url`, not `path`
**What goes wrong:** Designing the Zod schema for files with a `path` field instead of `url`.
**Why it happens:** Files intuitively have paths; the SDK uses `url` as the field name.
**How to avoid:** Match `FilePartInput` exactly: `{ type: "file", mime: string, filename?: string, url: string, source?: FilePartSource }`. The `url` field accepts file:// URIs for local files.
**Warning signs:** TypeScript error; OpenCode returns 400 bad request.

### Pitfall 3: Breaking createSession() callers
**What goes wrong:** Adding `parentID` as the third parameter (shifting `directory` to fourth), breaking `prefect_delegate` and `prefect_dispatch`.
**Why it happens:** Temptation to put the most related params together.
**How to avoid:** Add `parentID` as the fourth (trailing) optional parameter, after `directory`. Or use an options object for new optional params.
**Warning signs:** TypeScript compile error in prefect_delegate and prefect_dispatch handlers.

### Pitfall 4: FilePartSource complexity
**What goes wrong:** The Zod schema for `files` tries to model the full `FilePartSource` discriminated union (FileSource | SymbolSource), adding complexity.
**Why it happens:** The full FilePartInput type includes `source?: FilePartSource`.
**How to avoid:** Omit `source` from the MCP tool schema. The `source` field is optional and is primarily for OpenCode's internal use (tracking which file/symbol the content came from). The caller only needs to supply `type`, `mime`, `url`, and optionally `filename`.

### Pitfall 5: agentInput vs. agent override confusion
**What goes wrong:** User passes `agentInput: { type: "agent", name: "build" }` expecting it to override the agent, but the existing `agent: "build"` string field does the same thing.
**Why it happens:** Two mechanisms that look similar.
**How to avoid:** Document the distinction clearly. `agent` (top-level body string) is the standard per-call agent override. `agentInput` (AgentPartInput in parts array) is a structured part for multi-agent prompt composition workflows. Both are independently optional.

## Code Examples

### Full updated runPrompt() signature and body (reference)

```typescript
// Source: types.gen.d.ts SessionPromptData — verified body shape
export interface RunPromptOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
  // New in Phase 10:
  tools?: { [key: string]: boolean };         // RUN-05
  files?: Array<{ type: 'file'; mime: string; filename?: string; url: string }>;  // RUN-06
  messageID?: string;                          // RUN-07
  agentInput?: { type: 'agent'; name: string; };  // RUN-08
  subtaskInput?: { type: 'subtask'; prompt: string; description: string; agent: string; };  // RUN-08
}

// Body construction:
const parts = [
  { type: 'text' as const, text: prompt },
  ...(opts.files ?? []),
  ...(opts.agentInput ? [opts.agentInput] : []),
  ...(opts.subtaskInput ? [opts.subtaskInput] : []),
];

const body = {
  parts,
  ...(opts.model ? { model: opts.model } : {}),
  ...(opts.agent ? { agent: opts.agent } : {}),
  ...(opts.system ? { system: opts.system } : {}),
  ...(opts.tools ? { tools: opts.tools } : {}),
  ...(opts.messageID ? { messageID: opts.messageID } : {}),
};
```

### prefect_create_session Zod schema addition

```typescript
// Source: types.gen.d.ts SessionCreateData.body
inputSchema: z.object({
  title: z.string().optional().describe('Optional display title for the session'),
  parentID: z.string().optional().describe('Optional parent session ID — creates this session as a child for hierarchy tracking.'),
  directory: z.string().optional().describe('...'),
})
```

## Assumptions Log

All claims in this research were verified from the SDK type definitions at:
`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`

No assumed claims requiring user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

**This table is empty:** All claims were verified against the installed SDK types.

## Open Questions

1. **Should `prefect_prompt_async` also receive the four new fields?**
   - What we know: `SessionPromptAsyncData.body` has the identical shape as `SessionPromptData.body` — both include `tools`, `messageID`, `files` (via parts), `agentInput`/`subtaskInput` (via parts).
   - What's unclear: Phase 10 requirements only list `prefect_run` (RUN-05..08), not `prefect_prompt_async`.
   - Recommendation: Planner should flag this for the user. The change is a one-liner if done at the same time; deferring it means a separate phase just for async parity. Suggested: include it in Phase 10 as it is zero additional risk and keeps the two tools symmetric.

2. **Should `prefect_delegate` and `prefect_dispatch` expose the new fields?**
   - What we know: Both call `createSession()` and `runPrompt()` internally.
   - What's unclear: Composites currently don't expose all `prefect_run` params (e.g., `system` is exposed, but the composites are not the focus of this phase).
   - Recommendation: Out of scope for Phase 10. The composites can be extended later when callers need them.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are TypeScript source edits against the already-installed SDK).

## Validation Architecture

`nyquist_validation` is set to `false` in `.planning/config.json`. Validation Architecture section omitted per config.

## Security Domain

No security-sensitive changes. The new fields are passed through to OpenCode's own API. The `tools` override does not grant new permissions — it only restricts which tools are available for a single prompt. No ASVS categories are newly introduced by this phase.

## Sources

### Primary (HIGH confidence)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `SessionPromptData` (lines 2241-2287), `SessionPromptAsyncData` (lines 2326-2369), `SessionCreateData` (lines 1808-1832), `FilePartInput` (lines 1245-1253), `AgentPartInput` (lines 1253-1263), `SubtaskPartInput` (lines 1263-1270), `UserMessage.tools` (lines 56-59)
- `src/handlers.ts` — existing `RunPromptOptions` interface and `runPrompt()` implementation
- `src/index.ts` — existing `prefect_run` and `prefect_create_session` tool registrations

### Secondary (MEDIUM confidence)
- None needed — SDK types are the ground truth for this phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing SDK fully covers all requirements
- Architecture: HIGH — all five fields verified directly in installed SDK types
- Pitfalls: HIGH — derived from direct inspection of SDK types and existing code patterns

**Research date:** 2026-04-29
**Valid until:** Until `@opencode-ai/sdk` version bumps (stable for current installed version)
