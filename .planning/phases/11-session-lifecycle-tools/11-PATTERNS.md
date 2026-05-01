# Phase 11: Session Lifecycle Tools - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 1 (src/index.ts — all 5 tools added here)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` (5 new tool registrations) | controller | request-response | `src/index.ts` — existing session tools (lines 479–580) | exact |

All five tools are additive registrations inside `src/index.ts`. No new files are created.

**Per-tool analog assignments:**

| New Tool | Analog Tool | Lines | Match Quality | Reason |
|----------|-------------|-------|---------------|--------|
| `prefect_session_todo` | `prefect_session_children` | 531–554 | exact | Same shape: sessionId + directory, no body, array return |
| `prefect_session_summarize` | `prefect_session_command` | 582–626 | exact | Optional body fields passed conditionally via spread |
| `prefect_session_init` | `prefect_session_command` | 582–626 | exact | Optional body with multiple fields, same conditional spread pattern |
| `prefect_session_share` | `prefect_session_unrevert` | 556–580 | exact | No body (body?: never), returns full Session object |
| `prefect_session_unshare` | `prefect_session_unrevert` | 556–580 | exact | No body (body?: never), returns full Session object |

---

## Pattern Assignments

### `prefect_session_todo` (GET /session/:id/todo — no body, Array return)

**Analog:** `prefect_session_children` (`src/index.ts` lines 531–554)

**Core pattern** (lines 531–554):
```typescript
// SESSION-08: List child sessions forked from a parent session
server.registerTool(
  'prefect_session_children',
  {
    description: 'List all child sessions forked from this session. Returns an empty array if no forks have been made from this session. Use prefect_fork to create child sessions.',
    inputSchema: z.object({
      sessionId: z.string().describe('Parent session ID — must be a session that was previously forked from'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.children({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**What to copy:** Identical structure. Replace `client.session.children` with `client.session.todo`. Update tool name, description. No body.

---

### `prefect_session_summarize` (POST /session/:id/summarize — optional body {providerID, modelID})

**Analog:** `prefect_session_command` (`src/index.ts` lines 582–626)

**Core pattern — conditional body spread** (lines 606–625):
```typescript
async ({ sessionId, command, arguments: args, messageID, agent, model, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.command({
      path: { id: sessionId },
      body: {
        command,
        arguments: args,
        ...(messageID ? { messageID } : {}),
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
      },
      query: dir ? { directory: dir } : undefined,
    });
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

**Adaptation for summarize:** The body is entirely optional (not just individual fields). Only include body when BOTH `providerID` and `modelID` are present — they are required together within the body object:
```typescript
body: (providerID && modelID) ? { providerID, modelID } : undefined,
```

**Input schema additions:** `providerID: z.string().optional()`, `modelID: z.string().optional()` alongside the standard `sessionId` + `directory`.

---

### `prefect_session_init` (POST /session/:id/init — optional body {modelID, providerID, messageID})

**Analog:** `prefect_session_command` (`src/index.ts` lines 582–626)

**Core pattern — conditional body construction** (same as summarize but three optional fields):
```typescript
const body: { modelID?: string; providerID?: string; messageID?: string } | undefined =
  (providerID || modelID || messageID)
    ? { ...(providerID ? { providerID } : {}), ...(modelID ? { modelID } : {}), ...(messageID ? { messageID } : {}) }
    : undefined;
const { data, error } = await client.session.init({
  path: { id: sessionId },
  body,
  query: dir ? { directory: dir } : undefined,
});
```

**Input schema additions:** `providerID: z.string().optional()`, `modelID: z.string().optional()`, `messageID: z.string().optional()`.

**Key difference from summarize:** Three optional body fields that can be sent independently (not required together). Pass body only when at least one field is present.

---

### `prefect_session_share` (POST /session/:id/share — no body, Session return)

**Analog:** `prefect_session_unrevert` (`src/index.ts` lines 556–580)

**Core pattern — no body, `body?: never`** (lines 556–580):
```typescript
// SESSION-09: Undo a prior revert — NO body (SessionUnrevertData.body is typed never)
server.registerTool(
  'prefect_session_unrevert',
  {
    description: 'Restore all messages removed by a prior prefect_revert — undo the revert. Only valid if the session is in a reverted state (Session.revert field is non-null). Returns the updated Session object with the revert field cleared.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unrevert — must have been previously reverted'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.unrevert({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
        // NO body — SessionUnrevertData.body is typed `never`
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**What to copy:** Identical structure. Replace `client.session.unrevert` with `client.session.share`. Update tool name and description — must mention "After sharing, the share URL is available at `session.share.url` in the returned Session object."

---

### `prefect_session_unshare` (DELETE /session/:id/share — no body, Session return)

**Analog:** `prefect_session_unrevert` (`src/index.ts` lines 556–580)

Same structure as `prefect_session_share`. Replace `client.session.share` with `client.session.unshare`. Update description to mention the `share` field is cleared in the returned Session.

---

## Shared Patterns

### Imports (no new imports required)

**Source:** `src/index.ts` lines 1–11

All imports already present. No new imports are needed for any of the five tools.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import path from 'node:path';
import { fetchWithAuth } from './fetch.js';
import { resolveDirectory } from './config.js';
import { PartSchema } from './parts.js';
import { createSession, runPrompt, getDiff } from './handlers.js';
```

### Directory Resolution

**Source:** `src/index.ts` — every tool handler (e.g. line 61, 489, 541, 566)
**Apply to:** All five new tools

```typescript
const dir = resolveDirectory(directory);
// ...
query: dir ? { directory: dir } : undefined,
```

### Error Handling

**Source:** `src/index.ts` — every tool handler (e.g. lines 64–73, 491–500)
**Apply to:** All five new tools

```typescript
try {
  const { data, error } = await client.session.<method>({ ... });
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Standard inputSchema Shape

**Source:** `src/index.ts` — e.g. `prefect_session_children` lines 534–539
**Apply to:** All five new tools

```typescript
inputSchema: z.object({
  sessionId: z.string().describe('Session ID'),
  // ... tool-specific optional params ...
  directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
}),
```

### Insertion Point

**Source:** `src/index.ts` lines 910–917

New tools insert BEFORE the `async function main()` block at line 912. The last existing tool registration ends at line 910. Insert immediately before line 912.

---

## Anti-Patterns (from RESEARCH.md)

| Anti-Pattern | Correct Approach |
|--------------|-----------------|
| Include `body:` for `share`, `unshare`, or `todo` | Omit `body` entirely — `SessionShareData.body`, `SessionUnshareData.body`, `SessionTodoData.body` are typed `never` |
| Wrap `boolean` return in `{ success: data }` | Return `JSON.stringify(data)` directly — produces `"true"` for summarize/init, which is correct |
| Navigate `data.share?.url` after `summarize` or `init` | Only `share`/`unshare` return Session objects; `summarize`/`init` return plain `boolean` |
| Extract to `handlers.ts` | Do not add these tools to handlers.ts — none are called by composite tools |

---

## No Analog Found

None. All five tools have exact structural analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/index.ts` (all existing `server.registerTool` registrations)
**Files scanned:** 1 (`src/index.ts`, 922 lines, read in full)
**Pattern extraction date:** 2026-04-29
