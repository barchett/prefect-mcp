# Phase 4: Run Options + Structured Responses + Infrastructure - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 2 (1 heavily modified, 1 new)
**Analogs found:** 2 / 2

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/index.ts` (modified) | service | request-response | `src/index.ts` itself | exact (self) |
| `src/cli.ts` (new) | utility/cli | file-I/O | no existing analog | none |

**Scope note from CONTEXT.md:** All changes for RUN-01/02/03/04, SURF-01, SURF-02, CMD-01, and INFRA-01 land in `src/index.ts`. Only INFRA-02 requires a new file (`src/cli.ts`).

---

## Pattern Assignments

### `src/index.ts` — modifications for RUN-01/02/03/04, SURF-01, SURF-02, CMD-01, INFRA-01

**Analog:** `src/index.ts` (self — all patterns must be consistent with existing tools in this file)

---

#### Tool registration pattern (lines 15–36, representative example: `opencode_create_session`)

```typescript
server.registerTool(
  'opencode_create_session',
  {
    description: '...',
    inputSchema: z.object({
      title: z.string().optional().describe('...'),
      directory: z.string().optional().describe('...'),
    }),
  },
  async ({ title, directory }) => {
    try {
      const { data, error } = await client.session.create({
        body: { title },
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Apply to:** `opencode_prompt_async` (RUN-04) and `opencode_session_command` (CMD-01) — both are new tool registrations following this exact structure.

---

#### Current `opencode_run` handler (lines 59–86) — TARGET for INFRA-01 + RUN-01/02/03

```typescript
server.registerTool(
  'opencode_run',
  {
    description: '...',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
    }),
  },
  async ({ sessionId, prompt }) => {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`opencode_run timed out after ${TIMEOUT_MS / 1000}s — check OPENCODE_URL and model endpoint`)), TIMEOUT_MS)
      );
      const { data, error } = await Promise.race([
        client.session.prompt({
          path: { id: sessionId },
          body: { parts: [{ type: 'text', text: prompt }] },
        }),
        timeout,
      ]);
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**INFRA-01 replacement pattern** (from CONTEXT.md `<specifics>`): Replace the `Promise.race` / `new Promise<never>` pair with AbortController:

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text: prompt }], model, agent, system },
    signal: controller.signal,   // AbortSignal passed directly — Config extends Omit<RequestInit, ...>
  });
  clearTimeout(timer);
  if (error) throw new Error(JSON.stringify(error));
  // SURF-02: return structured parts array, not raw JSON.stringify(data)
  return { content: [{ type: 'text', text: JSON.stringify(data.parts) }] };
} catch (err) {
  clearTimeout(timer);
  if ((err as Error).name === 'AbortError') {
    throw new Error(`opencode_run timed out after ${TIMEOUT_MS / 1000}s — check OPENCODE_URL and model endpoint`);
  }
  throw err;
}
```

**RUN-01/02/03 Zod additions** to `opencode_run` inputSchema:

```typescript
inputSchema: z.object({
  sessionId: z.string().describe('Session ID from opencode_create_session'),
  prompt: z.string().describe('The coding task or instruction to send'),
  // RUN-01: model override — both fields required together
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }).optional().describe('Override the model for this call. Both providerID and modelID are required.'),
  // RUN-02: agent override
  agent: z.string().optional().describe('Override the agent for this call'),
  // RUN-03: system prompt override
  system: z.string().optional().describe('Override the system prompt for this call'),
}),
```

---

#### Current `opencode_get_diff` handler (lines 88–110) — TARGET for SURF-01

```typescript
server.registerTool(
  'opencode_get_diff',
  {
    description: '...',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().optional().describe('...'),
    }),
  },
  async ({ sessionId, messageID }) => {
    try {
      const { data, error } = await client.session.diff({
        path: { id: sessionId },
        query: messageID ? { messageID } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**SURF-01 replacement** — add `patch` field computed via `diff` npm package:

```typescript
import { createPatch } from 'diff';

// Inside the handler, replace the return line:
if (error) throw new Error(JSON.stringify(error));
const withPatch = (data as FileDiff[]).map(d => ({
  ...d,
  patch: createPatch(d.file, d.before, d.after),
}));
return { content: [{ type: 'text', text: JSON.stringify(withPatch) }] };
```

**`FileDiff` type** (from `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`, lines 32–38):
```typescript
export type FileDiff = {
    file: string;
    before: string;
    after: string;
    additions: number;
    deletions: number;
};
```

---

#### New `opencode_prompt_async` tool (RUN-04) — follows `opencode_run` + `opencode_abort` patterns

**SDK method:** `client.session.promptAsync({ path: { id }, body: { parts, model, agent, system } })`
**SDK response:** `204 void` — no data returned.
**Return value per D-14:** `{ sessionId: string, accepted: true }`

```typescript
server.registerTool(
  'opencode_prompt_async',
  {
    description: 'Send a prompt to an OpenCode session and return immediately without waiting for the agent to finish. Returns { sessionId, accepted: true } on success. Use opencode_session_status to poll for completion.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }).optional().describe('Override the model for this call'),
      agent: z.string().optional().describe('Override the agent for this call'),
      system: z.string().optional().describe('Override the system prompt for this call'),
    }),
  },
  async ({ sessionId, prompt, model, agent, system }) => {
    try {
      const { error } = await client.session.promptAsync({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: prompt }], ...(model ? { model } : {}), ...(agent ? { agent } : {}), ...(system ? { system } : {}) },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId, accepted: true }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Note:** No AbortController needed — fire-and-forget call returns 204 immediately.

---

#### New `opencode_session_command` tool (CMD-01) — closest existing analog: `opencode_revert` (lines 166–189)

**Analog choice rationale:** `opencode_revert` also takes `sessionId` + one required body field + optional fields, and returns a structured response. CMD-01 follows the same pattern.

**SDK method:** `client.session.command({ path: { id }, body: { command, arguments, messageID?, agent?, model? } })`
**SDK response:** `{ info: AssistantMessage, parts: Array<Part> }` (same shape as `opencode_run` response)
**CMD-01 note from D-19:** `model` here is `string` (plain), NOT `{ providerID, modelID }` — different from RUN-01.

```typescript
server.registerTool(
  'opencode_session_command',
  {
    description: 'Run a slash command inside an OpenCode session (e.g. /compact, /clear). Returns { info: AssistantMessage, parts: Part[] }.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      command: z.string().describe('The slash command name (without the leading slash, e.g. "compact")'),
      arguments: z.string().describe('Arguments string to pass to the command'),
      messageID: z.string().optional().describe('Optional message ID context'),
      agent: z.string().optional().describe('Optional agent override'),
      model: z.string().optional().describe('Optional model override (plain string, not { providerID, modelID })'),
    }),
  },
  async ({ sessionId, command, arguments: args, messageID, agent, model }) => {
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
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

---

#### SURF-02: Part union Zod schemas — authoritative field names from SDK types

The 12 Part types with their exact discriminator strings and fields
(from `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`, lines 142–353):

```typescript
// ToolState sub-types use `status` discriminant (NOT `type`)
// ToolStatePending: { status: "pending", input: {...}, raw: string }
// ToolStateRunning: { status: "running", input: {...}, title?, metadata?, time: { start } }
// ToolStateCompleted: { status: "completed", input: {...}, output, title, metadata, time: { start, end, compacted? }, attachments? }
// ToolStateError: { status: "error", input: {...}, error, metadata?, time: { start, end } }

// ToolPart: { id, sessionID, messageID, type: "tool", callID, tool, state: ToolState, metadata? }
// NOTE: ToolPart has a `tool` field (string) in addition to `callID` — easy to miss

// SubtaskPart is inline in the Part union (NOT a named export):
// { id, sessionID, messageID, type: "subtask", prompt, description, agent }

// StepFinishPart has cost and tokens fields (NOT just `reason`):
// { id, sessionID, messageID, type: "step-finish", reason, snapshot?, cost, tokens: { input, output, reasoning, cache: { read, write } } }

// RetryPart.error is typed as ApiError (NOT a plain string):
// { id, sessionID, messageID, type: "retry", attempt, error: ApiError, time: { created } }
// ApiError = { name: "APIError", data: { message, statusCode?, isRetryable } }

// FilePart has `url` field (NOT just `source`):
// { id, sessionID, messageID, type: "file", mime, filename?, url, source?: FilePartSource }
```

**Planner warning (from D-07):** These discriminator strings and field names MUST be used verbatim in Zod schemas. `status` (not `type`) discriminates ToolState. `tool` (string) is a required field on ToolPart alongside `callID`. `SubtaskPart` has no named export — define inline. `StepFinishPart` carries `cost` + `tokens`. `RetryPart.error` is `ApiError` shape, not a string.

---

### `src/cli.ts` (new) — INFRA-02: `prefect init` CLI

**Analog:** No existing analog in this codebase. The file has no precedent here.

**Pattern from CONTEXT.md decisions (D-16 through D-18):**

```typescript
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve absolute path to build/index.js from this CLI's own location
const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpServerPath = resolve(__dirname, 'index.js');

const MCP_ENTRY = {
  command: 'node',
  args: [mcpServerPath],
  env: {
    OPENCODE_URL: 'http://localhost:4096',
  },
};

const args = process.argv.slice(2);
const subcommand = args[0];
const force = args.includes('--force');

if (subcommand === 'init') {
  const mcpJsonPath = resolve(process.cwd(), '.mcp.json');
  // Merge-not-overwrite logic per D-17
  if (!existsSync(mcpJsonPath)) {
    // Case 1: create fresh
    const config = { mcpServers: { prefect: MCP_ENTRY } };
    writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
    console.error('Created .mcp.json with prefect entry');
  } else {
    const existing = JSON.parse(readFileSync(mcpJsonPath, 'utf8'));
    if (existing.mcpServers?.prefect && !force) {
      // Case 3: already exists, no --force
      console.error('Error: .mcp.json already contains a prefect entry. Use --force to overwrite.');
      process.exit(1);
    }
    // Case 2 or Case 4: add or overwrite only prefect key
    existing.mcpServers = existing.mcpServers ?? {};
    existing.mcpServers.prefect = MCP_ENTRY;
    writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2) + '\n');
    console.error(force ? 'Updated prefect entry in .mcp.json' : 'Added prefect entry to .mcp.json');
  }
} else {
  console.error('Usage: prefect init [--force]');
  process.exit(1);
}
```

**Note:** Uses `console.error` (never `console.log`) — consistent with `src/index.ts` line 414 where stderr-only is the rule because stdout may be used by other tooling.

---

## Shared Patterns

### Error handling
**Source:** `src/index.ts` (every tool handler)
**Apply to:** All new/modified tool handlers
```typescript
try {
  const { data, error } = await client.session.someMethod({ ... });
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Conditional body field spreading
**Source:** `src/index.ts` lines 153–162 (`opencode_fork`), 177–183 (`opencode_revert`)
**Apply to:** RUN-01/02/03 optional body fields, CMD-01 optional fields
```typescript
body: {
  required: value,
  ...(optionalField ? { optionalField } : {}),
}
```

### Stderr-only logging
**Source:** `src/index.ts` line 414
**Apply to:** `src/cli.ts` — never `console.log`, always `console.error`
```typescript
console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
```

### Constants at module top
**Source:** `src/index.ts` lines 8–10
**Apply to:** Any new module-level constants in `src/index.ts` modifications
```typescript
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10);
const client = createOpencodeClient({ baseUrl: BASE_URL });
```

---

## Config/Build Changes Required

### `package.json` — INFRA-02 bin field update
**Current (line 8–10):**
```json
"bin": {
  "prefect": "./build/index.js"
}
```
**Required change per D-16:** Update to point to `build/cli.js` (or add a second bin entry — planner decides based on D-16 note in CONTEXT.md "whether to keep `prefect` pointing to the MCP server or create a separate key").

### `package.json` — SURF-01 new dependency
**Add to `dependencies`:**
```json
"diff": "^7.0.0",
"@types/diff": "^7.0.0"
```
(`@types/diff` goes in `devDependencies`)

### `tsconfig.json` — no change required
Current `"include": ["src/**/*"]` already picks up `src/cli.ts`. No change needed.

### `package.json` build script — INFRA-02
**Current (line 6):**
```json
"build": "tsc && chmod 755 build/index.js"
```
**May need update to:** `"build": "tsc && chmod 755 build/index.js build/cli.js"` — planner handles.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/cli.ts` | utility/cli | file-I/O | No CLI entry points exist in this codebase; first Node.js script that reads/writes files directly |

---

## Metadata

**Analog search scope:** `src/` (single-file project), `node_modules/@opencode-ai/sdk/dist/gen/` (SDK types)
**Files scanned:** `src/index.ts` (421 lines, fully read), `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` (targeted reads of Part types, SessionPromptData, SessionPromptAsyncData, SessionCommandData, FileDiff), `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` (method signatures), `tsconfig.json`, `package.json`
**Pattern extraction date:** 2026-04-27
