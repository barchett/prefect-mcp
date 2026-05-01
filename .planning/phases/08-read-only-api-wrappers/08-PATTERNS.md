# Phase 8: Read-only API Wrappers - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 1 (src/index.ts — three new tool registrations added in-place)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` (opencode_list_agents) | tool registration | request-response | `src/index.ts` opencode_session_list (lines 282-303) | exact |
| `src/index.ts` (opencode_list_providers) | tool registration | request-response + transform | `src/index.ts` opencode_session_list (lines 282-303) | exact |
| `src/index.ts` (opencode_find_symbol) | tool registration | request-response + transform | `src/index.ts` opencode_session_messages (lines 353-379) | exact |

## Pattern Assignments

### `opencode_list_agents` (tool registration, request-response)

**Analog:** `src/index.ts` lines 282-303 (`opencode_session_list`)

This is the closest match: no `path` arg, optional `directory` only, single SDK call, direct JSON return. The response requires a map to filter fields.

**Imports pattern** — all required imports already present at lines 1-10:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { fetchWithAuth } from './fetch.js';
import { resolveDirectory } from './config.js';
```

**Core pattern** (lines 282-303 — session_list as template):
```typescript
server.registerTool(
  'opencode_session_list',
  {
    description: '...',
    inputSchema: z.object({
      directory: z.string().optional().describe('Filter sessions by project directory path'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.list({
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

**Adaptation for opencode_list_agents:**
- SDK call: `client.app.agents({ query: dir ? { directory: dir } : undefined })`
- Response type: `Array<Agent>` where `Agent` has `{ name, description?, mode, builtIn, permission, ... }`
- Map response: `(data ?? []).map(a => ({ name: a.name, description: a.description, mode: a.mode }))`
- Return: `JSON.stringify(mapped)` not raw `data`

---

### `opencode_list_providers` (tool registration, request-response + transform)

**Analog:** `src/index.ts` lines 282-303 (`opencode_session_list`)

Same skeleton as list_agents. Additional complexity: response is `{ all: Array<{...}> }` and models are an object map `{ [key: string]: Model }` requiring `Object.values()`.

**Core pattern** (same skeleton as session_list above):
```typescript
server.registerTool(
  'opencode_list_providers',
  {
    description: '...',
    inputSchema: z.object({
      directory: z.string().optional().describe('...'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.provider.list({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      // transform here
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Adaptation for opencode_list_providers:**
- SDK call: `client.provider.list({ query: dir ? { directory: dir } : undefined })`
- Response type: `{ all: Array<{ id, name, env, models: { [key: string]: { id, name, release_date, ... } } }> }`
- Unwrap and trim: `(data?.all ?? []).map(p => ({ id: p.id, name: p.name, models: Object.values(p.models).map(m => ({ id: m.id, name: m.name })) }))`
- Note: `models` on the response type is a dict `{ [key: string]: Model }`, not an array — must use `Object.values()`

---

### `opencode_find_symbol` (tool registration, request-response + transform)

**Analog:** `src/index.ts` lines 353-379 (`opencode_session_messages`) — best match because it uses a multi-field `query` object with spread construction (not just `dir ? { directory: dir } : undefined`).

**Multi-field query spread pattern** (lines 369-373):
```typescript
const { data, error } = await client.session.messages({
  path: { id: sessionId },
  query: { ...(limit !== undefined ? { limit } : {}), ...(dir ? { directory: dir } : {}) },
});
```

**Adaptation for opencode_find_symbol:**
- SDK call: `client.find.symbols({ query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) } })`
- Note: `FindSymbolsData.query` is required (not optional) and has `{ directory?: string, query: string }` — must always pass `query` field; pattern is spread not ternary
- Zod input param: `query: z.string().describe('Symbol name or pattern to search for')` plus `directory: z.string().optional()`
- Destructure to avoid shadowing: `const { query: symbolQuery, directory } = args`
- Response type: `Array<Symbol>` where `Symbol = { name: string, kind: number, location: { uri: string, range: Range } }`

**Path conversion pattern** (new logic, no existing analog — implement per CONTEXT.md D-06/D-07):
```typescript
import path from 'path';

// strip file:// prefix from URI
const absolutePath = sym.location.uri.replace(/^file:\/\//, '');
// make relative when dir is known (D-06)
const filePath = dir ? path.relative(dir, absolutePath) : absolutePath;
```

- Map each symbol: `{ name: sym.name, kind: sym.kind, path: filePath, range: sym.location.range }`
- `kind` field: include — it is an LSP SymbolKind number, adds value without clutter (Claude's Discretion from CONTEXT.md)
- `path` import: `import path from 'path'` — must be added to import block at top of `src/index.ts`

---

## Shared Patterns

### resolveDirectory — first line of every handler body
**Source:** `src/index.ts` lines 32, 53, 98, 183, etc.
**Apply to:** All three new tool handlers
```typescript
const dir = resolveDirectory(directory);
```
Always called before `try`, always uses the `directory` Zod input param.

### Error handling — uniform catch shape
**Source:** `src/index.ts` lines 36-38 (repeated throughout)
**Apply to:** All three new tool handlers
```typescript
if (error) throw new Error(JSON.stringify(error));
// ...
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Query construction — conditional directory
**Source:** `src/index.ts` lines 56-58 (session.abort), 295 (session.list)
**Apply to:** `opencode_list_agents`, `opencode_list_providers`
```typescript
query: dir ? { directory: dir } : undefined,
```

### Query construction — spread form for multi-field queries
**Source:** `src/index.ts` lines 371-373 (session.messages)
**Apply to:** `opencode_find_symbol` (required `query` field + optional `directory`)
```typescript
query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) },
```

### Return shape — JSON text content
**Source:** `src/index.ts` lines 35, 298, etc.
**Apply to:** All three new tool handlers
```typescript
return { content: [{ type: 'text', text: JSON.stringify(mappedData) }] };
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `path` URI stripping logic in `opencode_find_symbol` | utility transform | — | No existing URI-to-path conversion in codebase; implement per CONTEXT.md D-06/D-07 using `node:path` |

## SDK Field Reference (verified from types.gen.d.ts)

| Type | Relevant Fields |
|------|----------------|
| `Agent` (line 1399) | `name: string`, `description?: string`, `mode: "subagent" \| "primary" \| "all"`, `builtIn: boolean`, `permission: {...}` |
| `AppAgentsData` (line 2880) | `query?: { directory?: string }`, url: `/agent` |
| `AppAgentsResponses` (line 2888) | `200: Array<Agent>` |
| `ProviderListData` (line 2573) | `query?: { directory?: string }`, url: `/provider` |
| `ProviderListResponses` (line 2581) | `200: { all: Array<{ id, name, env, api?, npm?, models: { [key]: { id, name, release_date, ... } } }> }` |
| `Symbol` (line 1357) | `name: string`, `kind: number`, `location: { uri: string, range: Range }` |
| `FindSymbolsData` (line 2776) | `query: { directory?: string, query: string }` (required), url: `/find/symbol` |
| `FindSymbolsResponses` (line 2785) | `200: Array<Symbol>` |
| `client.app.agents()` (sdk.gen.d.ts line 263) | `options?: Options<AppAgentsData>` |
| `client.provider.list()` (sdk.gen.d.ts line 220) | `options?: Options<ProviderListData>` |
| `client.find.symbols()` (sdk.gen.d.ts line 239) | `options: Options<FindSymbolsData>` (required, not optional) |

## Metadata

**Analog search scope:** `src/index.ts` (all 22 existing tool registrations)
**Supporting files read:** `src/config.ts`, `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`, `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`
**Files scanned:** 4
**Pattern extraction date:** 2026-04-28
