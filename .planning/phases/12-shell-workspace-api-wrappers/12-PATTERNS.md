# Phase 12: Shell + Workspace API Wrappers - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 1 (src/index.ts — all ten tools added here)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` (SESSION-14 `prefect_session_shell`) | tool registration | request-response | `src/index.ts` lines 913-939 (`prefect_session_summarize`) | exact — session tool with body containing required fields |
| `src/index.ts` (API-04 `prefect_vcs_info`) | tool registration | request-response | `src/index.ts` lines 821-847 (`prefect_list_agents`) | exact — workspace tool, directory-only schema |
| `src/index.ts` (API-05 `prefect_file_status`) | tool registration | request-response | `src/index.ts` lines 821-847 (`prefect_list_agents`) | exact — workspace tool, directory-only schema |
| `src/index.ts` (API-06 `prefect_list_mcp_servers`) | tool registration | request-response | `src/index.ts` lines 821-847 (`prefect_list_agents`) | exact — workspace tool, directory-only schema |
| `src/index.ts` (API-07 `prefect_inject_mcp_server`) | tool registration | request-response | `src/index.ts` lines 505-530 (`prefect_session_rename`) | role-match — POST with structured body |
| `src/index.ts` (API-08 `prefect_list_tools`) | tool registration | request-response | `src/index.ts` lines 877-911 (`prefect_find_symbol`) + `prefect_list_agents` | partial-match — branching on optional params |
| `src/index.ts` (API-09 `prefect_find_file`) | tool registration | request-response | `src/index.ts` lines 877-911 (`prefect_find_symbol`) | exact — required query param with destructure rename |
| `src/index.ts` (API-10 `prefect_get_file_content`) | tool registration | request-response | `src/index.ts` lines 877-911 (`prefect_find_symbol`) | exact — required query param with destructure rename |
| `src/index.ts` (API-11 `prefect_get_config`) | tool registration | request-response | `src/index.ts` lines 821-847 (`prefect_list_agents`) | exact — workspace tool, directory-only schema |
| `src/index.ts` (API-12 `prefect_list_commands`) | tool registration | request-response | `src/index.ts` lines 821-847 (`prefect_list_agents`) | exact — workspace tool, directory-only schema |

---

## Pattern Assignments

### Analog A: Simple Workspace Tool (directory-only schema)

**Source:** `src/index.ts` lines 821–847 (`prefect_list_agents`)

Applies to: API-04 (`prefect_vcs_info`), API-05 (`prefect_file_status`), API-06 (`prefect_list_mcp_servers`), API-11 (`prefect_get_config`), API-12 (`prefect_list_commands`)

**Full pattern** (lines 821–847):
```typescript
// API-01: List OpenCode agents (Phase 8)
server.registerTool(
  'prefect_list_agents',
  {
    description: 'List the agents available in the connected OpenCode instance. Returns Array<{ name, description?, mode }>. Use the returned name (e.g. "build", "general") as the agent param when calling prefect_run. Pass directory to scope to a specific project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.app.agents({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      const mapped = (data ?? []).map((a) => ({
        name: a.name,
        description: a.description,
        mode: a.mode,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Key structural points:**
- `inputSchema: z.object({ directory: z.string().optional().describe(...) })` — no other params
- `const dir = resolveDirectory(directory);` — always first line of handler
- `query: dir ? { directory: dir } : undefined` — conditional directory on every SDK call
- `if (error) throw new Error(JSON.stringify(error));` — error check before use
- `return { content: [{ type: 'text', text: JSON.stringify(data) }] };` — pass data through as-is
- `catch (err)` block returns `{ ..., isError: true }` — always present

**For API-04/05/06/11/12:** Replace `client.app.agents(...)` with the appropriate client method. Remove the `.map()` step — return `JSON.stringify(data)` directly without transformation. The directory-only schema and all three structural points above are copied verbatim.

---

### Analog B: Session Tool with Required Body Fields

**Source:** `src/index.ts` lines 913–939 (`prefect_session_summarize`)

Applies to: SESSION-14 (`prefect_session_shell`)

**Full pattern** (lines 913–939):
```typescript
// SESSION-11: Trigger session summary generation
server.registerTool(
  'prefect_session_summarize',
  {
    description: 'Trigger summary generation for an OpenCode session. Returns true when the summarization was accepted. providerID and modelID are required — the endpoint has no default fallback. providerID must match a provider configured in the OpenCode server (e.g. "vllm" or "anthropic"); using an unconfigured provider returns ProviderModelNotFoundError.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      providerID: z.string().describe('Required. Provider ID for summarization — must match a provider configured in the OpenCode server (e.g. "vllm"). Using an unconfigured provider returns ProviderModelNotFoundError.'),
      modelID: z.string().describe('Required. Model ID for summarization. Must be available under the specified providerID.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, providerID, modelID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.summarize({
        path: { id: sessionId },
        body: { providerID, modelID },
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

**Key structural points for SESSION-14:**
- `path: { id: sessionId }` — session path param
- `body: { agent, command, ...(model ? { model } : {}) }` — required fields in body, optional spread inline
- `query: dir ? { directory: dir } : undefined` — same directory conditional
- `sessionId` is required (no `.optional()`) in the Zod schema
- `agent` and `command` must also be `z.string()` without `.optional()` — marked required despite SDK typing `body?` as optional

**Additional body shape for SESSION-14** (from RESEARCH.md):
```typescript
body: {
  agent,
  command,
  ...(model ? { model } : {}),
}
```
Where `model` is `z.object({ providerID: z.string(), modelID: z.string() }).optional()` — same shape as `prefect_run`'s model param (lines 93–100 of `src/index.ts`).

---

### Analog C: POST Tool with Structured Body

**Source:** `src/index.ts` lines 505–530 (`prefect_session_rename`)

Applies to: API-07 (`prefect_inject_mcp_server`) — body construction pattern

**Full pattern** (lines 505–530):
```typescript
// SESSION-07: Rename a session — MCP tool is "rename" but SDK method is client.session.update()
server.registerTool(
  'prefect_session_rename',
  {
    description: 'Rename an OpenCode session. Returns the full updated Session object.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to rename'),
      title: z.string().describe('New display title for the session'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, title, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.update({  // NOT client.session.rename — does not exist
        path: { id: sessionId },
        body: { title },
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

**For API-07 (`prefect_inject_mcp_server`):** The body construction is more complex (discriminated union based on `configType`). The structural pattern — `body: { ... }` key, `query: dir ? { directory: dir } : undefined`, error check, JSON.stringify return — is identical. The body field is assembled via a ternary/conditional before the SDK call:

```typescript
// API-07 body construction (from RESEARCH.md Pattern 4):
const config: import('@opencode-ai/sdk').McpLocalConfig | import('@opencode-ai/sdk').McpRemoteConfig =
  configType === 'local'
    ? {
        type: 'local',
        command: commandArgs ?? [],
        ...(environment ? { environment } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(timeout !== undefined ? { timeout } : {}),
      }
    : {
        type: 'remote',
        url: url ?? '',
        ...(headers ? { headers } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      };
const { data, error } = await client.mcp.add({
  body: { name, config },
  query: dir ? { directory: dir } : undefined,
});
```

Note: API-07 has no `path:` param (not a session endpoint) — unlike `prefect_session_rename`. The `body:` and `query:` structure is otherwise identical.

---

### Analog D: Required Query Param with Destructure Rename

**Source:** `src/index.ts` lines 877–911 (`prefect_find_symbol`)

Applies to: API-09 (`prefect_find_file`), API-10 (`prefect_get_file_content`)

**Full pattern** (lines 877–911):
```typescript
// API-03: Find workspace symbols by query (Phase 8)
server.registerTool(
  'prefect_find_symbol',
  {
    description: 'Search the OpenCode workspace for symbols matching a query string (e.g. function or class names). Returns Array<{ name, kind, path, range }> where path is project-root-relative when a directory is resolved (via directory param or OPENCODE_DEFAULT_PROJECT), absolute otherwise. kind is the LSP SymbolKind number.',
    inputSchema: z.object({
      query: z.string().describe('Symbol name or pattern to search for'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async (args) => {
    const { query: symbolQuery, directory } = args;
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.find.symbols({
        query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) },
      });
      if (error) throw new Error(JSON.stringify(error));
      const mapped = (data ?? []).map((sym) => {
        if (!sym.location.uri.startsWith('file://')) return null;
        const absolutePath = decodeURIComponent(sym.location.uri.replace(/^file:\/\//, ''));
        const filePath = dir ? path.relative(dir, absolutePath) : absolutePath;
        return {
          name: sym.name,
          kind: sym.kind,
          path: filePath,
          range: sym.location.range,
        };
      }).filter((sym) => sym !== null);
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Key structural points for API-09 and API-10:**
- `async (args) =>` signature — use `args` when destructure would shadow a built-in name
- `const { query: symbolQuery, directory } = args;` — rename the conflicting param immediately, then use the renamed variable throughout
- `query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) }` — spread directory conditionally into the query object (not passed as a top-level optional)

**For API-09 (`prefect_find_file`):**
- Rename `query` → `fileQuery` to avoid collision with the SDK `query:` key name
- Add `dirs` optional param: `z.enum(['true', 'false']).optional()` — NOT `z.boolean()`
- SDK call: `client.find.files({ query: { query: fileQuery, ...(dirs ? { dirs } : {}), ...(dir ? { directory: dir } : {}) } })`
- No `.map()` — return `JSON.stringify(data)` directly

**For API-10 (`prefect_get_file_content`):**
- Rename `path` → `filePath` to avoid shadowing `import path from 'node:path'` (line 7 of `src/index.ts`)
- Use `async (args) =>` signature, destructure as `const { path: filePath, directory } = args;`
- SDK call: `client.file.read({ query: { path: filePath, ...(dir ? { directory: dir } : {}) } })`
- No `.map()` — return `JSON.stringify(data)` directly

---

### Analog E: Dual-Endpoint Branching Tool

**Source:** No direct analog — `prefect_list_tools` (API-08) is the only tool in the codebase that selects between two SDK methods based on optional param presence.

**Closest partial analog:** `src/index.ts` lines 821–847 (`prefect_list_agents`) for the simple branch, and `src/index.ts` lines 877–911 (`prefect_find_symbol`) for the required query params in the complex branch.

**Pattern from RESEARCH.md (verified against SDK types):**
```typescript
server.registerTool(
  'prefect_list_tools',
  {
    description: '...',
    inputSchema: z.object({
      provider: z.string().optional().describe('Provider ID (e.g. "anthropic"). Required when model is provided.'),
      model: z.string().optional().describe('Model ID (e.g. "claude-sonnet-4-6"). Required when provider is provided.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ provider, model, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      if (provider && model) {
        // GET /experimental/tool — requires BOTH provider + model (non-optional in SDK)
        const { data, error } = await client.tool.list({
          query: {
            provider,
            model,
            ...(dir ? { directory: dir } : {}),
          },
        });
        if (error) throw new Error(JSON.stringify(error));
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } else {
        // GET /experimental/tool/ids — no required params
        const { data, error } = await client.tool.ids({
          query: dir ? { directory: dir } : undefined,
        });
        if (error) throw new Error(JSON.stringify(error));
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Critical constraint:** `client.tool.list()` MUST only be called inside the `if (provider && model)` branch. The SDK types `ToolListData.query.provider` and `ToolListData.query.model` as non-optional strings — the TypeScript compiler rejects a call without both present.

---

## Shared Patterns

### resolveDirectory() Usage
**Source:** `src/config.ts` (full file, 29 lines)
**Apply to:** All ten new tool registrations

```typescript
// Always the first line inside the async handler, before try/catch:
const dir = resolveDirectory(directory);
```

The function signature:
```typescript
export function resolveDirectory(perToolParam: string | undefined): string | undefined
```

Fallback chain: per-tool `directory` param → `PREFECT_DEFAULT_PROJECT` env → `OPENCODE_DEFAULT_PROJECT` (deprecated, one-time warning) → `undefined`. Returns `undefined` when no directory source is set — do NOT substitute `process.cwd()`.

### Error Handling
**Source:** `src/index.ts` — present in every tool handler
**Apply to:** All ten new tool registrations

```typescript
try {
  // ... SDK call ...
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

Two error paths:
1. `if (error) throw` — for structured API errors (the SDK returns `{ data, error }` pairs)
2. `catch (err)` — for all other thrown errors (network, timeout, thrown from path 1)

### Conditional Directory Query
**Source:** `src/index.ts` — present in every tool handler
**Apply to:** All ten new tool registrations

For tools where `query` only contains `directory`:
```typescript
query: dir ? { directory: dir } : undefined,
```

For tools where `query` contains other required params alongside optional `directory`:
```typescript
query: {
  requiredParam: value,
  ...(dir ? { directory: dir } : {}),
},
```

Never pass `query: { directory: undefined }` — always use the ternary to omit the query entirely when `dir` is falsy.

### Insertion Point
**Source:** `src/index.ts` line 1067 (start of `async function main()`)
**Apply to:** All ten new tool registrations

Insert all ten `server.registerTool(...)` blocks immediately before line 1067, after the last existing tool registration (currently `prefect_session_unshare`, ending at line 1065). Each tool block is separated by a blank line and preceded by a comment following the format: `// REQUIREMENT-ID: tool description (Phase N)`.

### Comment Format
**Source:** `src/index.ts` — lines 30, 52, 583, 821, 849, 877, 913, 942, 967, 1017
**Apply to:** All ten new tool registrations

```typescript
// SESSION-14: prefect_session_shell — execute a shell command in a session context
server.registerTool(
  'prefect_session_shell',
  ...
```

Use the requirement ID from RESEARCH.md (SESSION-14, API-04 through API-12) as the comment prefix.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | — | — | All ten tools have sufficient analogs in existing tool registrations |

The dual-endpoint branching pattern for API-08 (`prefect_list_tools`) is novel but is fully specified in RESEARCH.md Pattern 5 with verified SDK types. No additional codebase search needed.

---

## Metadata

**Analog search scope:** `src/index.ts` (all 1078 lines, read in full)
**Supporting files read:** `src/handlers.ts`, `src/config.ts`, `src/auth.ts`
**Files scanned:** 4
**Analogs extracted:** 5 structural patterns covering all 10 new tools
**Pattern extraction date:** 2026-04-30
