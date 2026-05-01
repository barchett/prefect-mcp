# Phase 10: Run + Session Param Additions - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 2 (src/handlers.ts, src/index.ts)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/handlers.ts` | service | request-response | `src/handlers.ts` itself (extend in-place) | exact — same file, additive changes |
| `src/index.ts` | controller | request-response | `src/index.ts` itself (extend in-place) | exact — same file, additive changes |

Both files are modified in-place. The closest analogs ARE the existing implementations — Phase 10 is a pure additive extension of existing patterns.

## Pattern Assignments

### `src/handlers.ts` — `RunPromptOptions` interface extension + `runPrompt()` body + `createSession()` signature

**Analog:** `src/handlers.ts` (lines 1-90, read in full above)

**Imports pattern** (lines 1-4):
```typescript
import { createOpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import { z } from 'zod';
import { PartSchema } from './parts.js';
```
No new imports needed for Phase 10.

**Current `RunPromptOptions` interface** (lines 8-12):
```typescript
export interface RunPromptOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
}
```

**Pattern to copy — extend `RunPromptOptions` with four new optional fields** (add after line 12):
```typescript
export interface RunPromptOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
  // New in Phase 10:
  tools?: { [key: string]: boolean };                                                   // RUN-05
  files?: Array<{ type: 'file'; mime: string; filename?: string; url: string }>;       // RUN-06
  messageID?: string;                                                                   // RUN-07
  agentInput?: { type: 'agent'; name: string };                                        // RUN-08
  subtaskInput?: { type: 'subtask'; prompt: string; description: string; agent: string }; // RUN-08
}
```

**Current `runPrompt()` body construction** (lines 48-58):
```typescript
const { data, error } = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: 'text', text: prompt }],
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.agent ? { agent: opts.agent } : {}),
    ...(opts.system ? { system: opts.system } : {}),
  },
  query: directory ? { directory } : undefined,
  signal,
});
```

**Pattern to copy — extended `runPrompt()` body construction** (replace the `body:` block above):
```typescript
const parts: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; filename?: string; url: string } | { type: 'agent'; name: string } | { type: 'subtask'; prompt: string; description: string; agent: string }> = [
  { type: 'text', text: prompt },
  ...(opts.files ?? []),
  ...(opts.agentInput ? [opts.agentInput] : []),
  ...(opts.subtaskInput ? [opts.subtaskInput] : []),
];

const { data, error } = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.agent ? { agent: opts.agent } : {}),
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.messageID ? { messageID: opts.messageID } : {}),
  },
  query: directory ? { directory } : undefined,
  signal,
});
```

**Current `createSession()` signature and body** (lines 19-31):
```typescript
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await client.session.create({
    body: { title },
    query: directory ? { directory } : undefined,
  });
  if (error) throw new Error(JSON.stringify(error));
  if (!data) throw new Error('createSession: API returned no data and no error');
  return data;
}
```

**Pattern to copy — extend `createSession()` with trailing optional `parentID` parameter** (SESSION-10):
```typescript
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,                                // NEW — trailing optional, safe for existing callers
): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await client.session.create({
    body: {
      title,
      ...(parentID ? { parentID } : {}),           // NEW
    },
    query: directory ? { directory } : undefined,
  });
  if (error) throw new Error(JSON.stringify(error));
  if (!data) throw new Error('createSession: API returned no data and no error');
  return data;
}
```

**Existing callers of `createSession()` that must NOT break** (src/index.ts lines 591, 637):
```typescript
// prefect_delegate (line 591) — passes (client, title, dir) — safe with trailing optional
const session = await createSession(client, title, dir);

// prefect_dispatch (line 637) — passes (client, title, dir) — safe with trailing optional
const session = await createSession(client, title, dir);
```

---

### `src/index.ts` — Zod schema extensions for `prefect_run` and `prefect_create_session`

**Analog:** `src/index.ts` (lines 1-858, read in full above)

**Existing optional Zod field pattern** (lines 92-103 — `prefect_run` inputSchema):
```typescript
// RUN-01: model override — both providerID AND modelID required together
model: z
  .object({
    providerID: z.string(),
    modelID: z.string(),
  })
  .optional()
  .describe('Override the model for this single call. Both providerID and modelID are required together.'),
// RUN-02: agent override
agent: z.string().optional().describe('Override the agent for this single call.'),
// RUN-03: system prompt override
system: z.string().optional().describe('Override the system prompt for this single call.'),
```

**Pattern to copy — four new Zod fields to add to `prefect_run` inputSchema** (insert after the `system` field, before the closing `}`):
```typescript
// RUN-05: tools override — CRITICAL: record, not array
tools: z.record(z.string(), z.boolean()).optional()
  .describe('Override enabled tools for this call. Map of tool ID to boolean enable/disable flag. Example: { "bash": true, "edit": false }'),
// RUN-06: file attachments
files: z.array(z.object({
  type: z.literal('file'),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
})).optional()
  .describe('File attachments to include as context. Each file requires mime type and url (use file:// URIs for local paths).'),
// RUN-07: message resume
messageID: z.string().optional()
  .describe('Resume the session from this message ID rather than appending to the end.'),
// RUN-08: structured agent/subtask part inputs
agentInput: z.object({
  type: z.literal('agent'),
  name: z.string(),
}).optional()
  .describe('Structured agent part input — specify the agent name for this prompt. Distinct from the top-level agent string override.'),
subtaskInput: z.object({
  type: z.literal('subtask'),
  prompt: z.string(),
  description: z.string(),
  agent: z.string(),
}).optional()
  .describe('Structured subtask part input — delegate a subtask to a specific agent.'),
```

**Current `prefect_run` handler destructuring** (line 105):
```typescript
async ({ sessionId, prompt, directory, model, agent, system }) => {
```

**Pattern to copy — extend destructuring for new fields:**
```typescript
async ({ sessionId, prompt, directory, model, agent, system, tools, files, messageID, agentInput, subtaskInput }) => {
```

**Current `prefect_run` `runPrompt` call** (line 110):
```typescript
const result = await runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal);
```

**Pattern to copy — thread new fields into opts:**
```typescript
const result = await runPrompt(client, sessionId, prompt, { model, agent, system, tools, files, messageID, agentInput, subtaskInput }, dir, controller.signal);
```

**Current `prefect_create_session` inputSchema** (lines 34-37):
```typescript
inputSchema: z.object({
  title: z.string().optional().describe('Optional display title for the session'),
  directory: z.string().optional().describe('Absolute path to the project root for this session. Defaults to the directory OpenCode was started from.'),
}),
```

**Pattern to copy — add `parentID` field to `prefect_create_session` inputSchema:**
```typescript
inputSchema: z.object({
  title: z.string().optional().describe('Optional display title for the session'),
  parentID: z.string().optional().describe('Optional parent session ID — creates this session as a child of the given parent for hierarchy tracking.'),   // NEW — SESSION-10
  directory: z.string().optional().describe('Absolute path to the project root for this session. Defaults to the directory OpenCode was started from.'),
}),
```

**Current `prefect_create_session` handler** (lines 39-47):
```typescript
async ({ title, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const session = await createSession(client, title, dir);
    return { content: [{ type: 'text', text: JSON.stringify(session) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

**Pattern to copy — extend to pass `parentID`:**
```typescript
async ({ title, parentID, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const session = await createSession(client, title, dir, parentID);   // NEW: pass parentID as 4th arg
    return { content: [{ type: 'text', text: JSON.stringify(session) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

---

### `prefect_prompt_async` — optional symmetric extension (open question from RESEARCH.md)

The `prefect_prompt_async` tool (src/index.ts lines 135-178) builds its body identically to the old `runPrompt()` pattern. If the planner decides to include async parity in Phase 10, the inline body at lines 160-166 should receive the same `tools`, `files`, `messageID`, `agentInput`, `subtaskInput` fields using the same conditional spread pattern:

**Current `prefect_prompt_async` body** (lines 160-166):
```typescript
body: {
  parts: [{ type: 'text', text: prompt }],
  ...(model ? { model } : {}),
  ...(agent ? { agent } : {}),
  ...(system ? { system } : {}),
},
```

**Pattern to copy — extended async body** (same pattern as updated `runPrompt()`):
```typescript
body: {
  parts: [
    { type: 'text', text: prompt },
    ...(files ?? []),
    ...(agentInput ? [agentInput] : []),
    ...(subtaskInput ? [subtaskInput] : []),
  ],
  ...(model ? { model } : {}),
  ...(agent ? { agent } : {}),
  ...(system ? { system } : {}),
  ...(tools ? { tools } : {}),
  ...(messageID ? { messageID } : {}),
},
```

The planner should flag this decision for the user (in scope for zero additional risk, out of scope per Phase 10 requirements as written).

---

## Shared Patterns

### Optional field conditional spread pattern
**Source:** `src/handlers.ts` lines 52-55 and `src/index.ts` lines 161-165
**Apply to:** All new optional body fields in both `runPrompt()` and `prefect_prompt_async`
```typescript
// Pattern: spread only if value is truthy
...(opts.fieldName ? { fieldName: opts.fieldName } : {}),
```

### Trailing optional parameter extension (safe for existing callers)
**Source:** `src/handlers.ts` `createSession()` signature — `directory: string | undefined` is the third param
**Apply to:** `createSession()` parentID addition
```typescript
// Add as 4th param — existing callers that pass 3 args are unaffected
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,            // trailing optional — zero breaking change
): Promise<...>
```

### Error handling pattern (unchanged — copy exactly)
**Source:** `src/handlers.ts` lines 59-62
```typescript
if (error) throw new Error(JSON.stringify(error));
if (!data) throw new Error('runPrompt: API returned no data and no error');
```

### Zod `.optional().describe(...)` chaining pattern
**Source:** `src/index.ts` lines 100-103
```typescript
agent: z.string().optional().describe('Override the agent for this single call.'),
system: z.string().optional().describe('Override the system prompt for this single call.'),
```
All new Zod fields follow this same `.optional().describe(...)` chain pattern.

## No Analog Found

No files lack analogs. All Phase 10 changes are additive edits to existing files where the existing code IS the analog.

## Critical Anti-Patterns (from RESEARCH.md — do not use)

| Anti-Pattern | Correct Pattern |
|---|---|
| `tools: z.array(z.string())` | `tools: z.record(z.string(), z.boolean())` — SDK type is `{ [key: string]: boolean }` |
| `parts: [..., tools, messageID]` | `tools` and `messageID` are top-level body fields, NOT part of the parts array |
| `createSession(client, title, parentID, dir)` — parentID as 3rd param | `createSession(client, title, dir, parentID)` — parentID MUST be 4th to avoid breaking callers |
| `files: [{ path: '...', mime: '...' }]` | `files: [{ type: 'file', url: 'file://...', mime: '...' }]` — SDK uses `url`, not `path` |

## Metadata

**Analog search scope:** `src/handlers.ts` (90 lines), `src/index.ts` (859 lines)
**Files scanned:** 2 (both read in full — both under 2,000 lines)
**Pattern extraction date:** 2026-04-29
