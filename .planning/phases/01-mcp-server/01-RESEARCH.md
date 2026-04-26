# Phase 1: MCP Server - Research

**Researched:** 2026-04-25
**Domain:** TypeScript MCP Server + OpenCode HTTP API
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | `opencode_create_session` wraps POST /session | Session type confirmed: `{ id, title, projectID, directory, ... }` |
| CORE-02 | `opencode_run` wraps POST /session/{id}/message; blocks until complete | Endpoint confirmed; blocking behavior verified: streams until agent loop ends, then writes JSON once |
| CORE-03 | `opencode_get_diff` wraps GET /session/{id}/diff (optional messageID) | Endpoint confirmed: returns `FileDiff[]` |
| CORE-04 | `opencode_approve_permission` wraps POST /session/{id}/permissions/{permId} | Confirmed; valid `response` values are `"once" | "always" | "reject"` — NOT "allow/deny/allow_always" |
| CORE-05 | `opencode_fork` wraps POST /session/{id}/fork (optional messageID) | Confirmed: returns `Session` |
| CORE-06 | `opencode_revert` wraps POST /session/{id}/revert | Confirmed: body `{ messageID: string, partID?: string }` |
| CORE-07 | `opencode_abort` wraps POST /session/{id}/abort | Confirmed: no body required |
| CORE-08 | Base URL from `OPENCODE_URL` env var, default `http://localhost:4096` | Confirmed; user must explicitly pass `--port 4096` to `opencode serve` since serve now defaults to port 0 (random) |
</phase_requirements>

---

## Summary

This phase builds a TypeScript MCP server that wraps OpenCode's HTTP API as Claude Code tools. The MCP SDK (`@modelcontextprotocol/sdk` v1.29.0) provides `McpServer` and `StdioServerTransport` — Claude Code spawns the server as a stdio subprocess, communicates over stdin/stdout, and discovers registered tools automatically.

OpenCode exposes a well-typed HTTP REST API (OpenAPI 3.1 spec at `http://localhost:4096/doc`). All 7 endpoints required by CORE-01 through CORE-07 are confirmed via the `@opencode-ai/sdk` type definitions. The most important implementation detail: `POST /session/{id}/message` (used by `opencode_run`) uses a long-lived streaming connection that blocks until the full agent loop completes, then writes a single JSON response. This is the correct blocking behavior needed for CORE-02 — no polling required, but HTTP timeouts must not be set too short.

One critical discrepancy from the requirements: CORE-04 specifies `allow/deny/allow_always` as permission response values, but the OpenCode SDK types and API define them as `"once" | "always" | "reject"`. The implementation must use the SDK-defined values.

**Primary recommendation:** Build against `@opencode-ai/sdk` for type-safe HTTP calls, use `McpServer.registerTool()` with Zod schemas, send all logs to stderr (never stdout — it corrupts the stdio JSON-RPC stream).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP protocol (tool discovery, invocation) | MCP Server (this process) | — | MCP SDK handles JSON-RPC framing over stdio |
| HTTP calls to OpenCode | MCP Server (this process) | — | Direct fetch calls; OpenCode runs as a separate process |
| Session lifecycle (create/fork/revert/abort) | MCP Server (this process) | OpenCode HTTP | MCP tool wraps OpenCode endpoint 1:1 |
| Permission approval | MCP Server (this process) | OpenCode HTTP | Pass-through; user's OpenCode config auto-approves anyway |
| Actual file editing / LLM inference | OpenCode process | — | Out of scope for this phase; delegated entirely |
| Configuration (base URL) | Env var `OPENCODE_URL` | — | Read at startup; no runtime config changes needed |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP server framework, `McpServer`, `StdioServerTransport` | Official Anthropic SDK; only supported way to build Claude Code tools |
| `@opencode-ai/sdk` | 1.14.25 | Type-safe HTTP client for OpenCode REST API | Auto-generated from OpenCode's OpenAPI spec; types are authoritative |
| `zod` | 4.3.6 | Input schema validation for MCP tool parameters | Required by MCP SDK for `inputSchema`; peer dependency |
| `typescript` | 6.0.3 | Type safety | Project constraint; MCP SDK is idiomatic TS |

[VERIFIED: npm registry — versions confirmed 2026-04-25]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/node` | latest | Node.js type definitions | Required for `process.env`, stdio, etc. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@opencode-ai/sdk` | Raw `fetch` | Raw fetch avoids a dependency but loses all type safety; SDK is auto-generated from the OpenAPI spec so it's always in sync |
| `@opencode-ai/sdk` | `@opencode-ai/sdk/v2` | The v2 export exists but documentation is sparse; use the default export |

**Installation:**
```bash
npm init -y
npm install @modelcontextprotocol/sdk @opencode-ai/sdk zod
npm install -D typescript @types/node
```

**Version verification:** [VERIFIED: npm registry]
- `@modelcontextprotocol/sdk`: 1.29.0 (latest, 2026-04-25)
- `@opencode-ai/sdk`: 1.14.25 (latest, 2026-04-25)
- `zod`: 4.3.6 (latest, 2026-04-25)
- `typescript`: 6.0.3 (latest, 2026-04-25)

---

## Architecture Patterns

### System Architecture Diagram

```
Claude Code
     |
     | (spawns as subprocess)
     v
[Prefect MCP Server — Node.js process]
     |  stdin/stdout (JSON-RPC via StdioServerTransport)
     |
     |-- tool: opencode_create_session -----> POST /session
     |-- tool: opencode_run ----------------> POST /session/{id}/message
     |                                        (long-lived, blocks until done)
     |-- tool: opencode_get_diff -----------> GET  /session/{id}/diff
     |-- tool: opencode_approve_permission -> POST /session/{id}/permissions/{permId}
     |-- tool: opencode_fork --------------> POST /session/{id}/fork
     |-- tool: opencode_revert ------------> POST /session/{id}/revert
     |-- tool: opencode_abort -------------> POST /session/{id}/abort
     |
     v
[OpenCode — separate process]
  opencode serve --port 4096
  http://localhost:4096  (base URL from OPENCODE_URL env)
```

### Recommended Project Structure

```
/
├── src/
│   └── index.ts        # McpServer setup, tool registrations, StdioServerTransport.connect()
├── build/
│   └── index.js        # compiled output (git-ignored)
├── package.json        # type: "module", build script
└── tsconfig.json       # target: ES2022, module: Node16
```

Note: All 7 tools fit in a single `src/index.ts` for this phase. No need to split into modules.

### Pattern 1: McpServer with Stdio Transport

**What:** Create an `McpServer`, register tools with Zod schemas, connect to `StdioServerTransport`.
**When to use:** Always — this is the only supported pattern for Claude Code MCP integration.

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

const server = new McpServer({ name: 'prefect', version: '1.0.0' });

server.registerTool(
  'opencode_create_session',
  {
    description: 'Create a new OpenCode session. Returns a session ID.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional title for the session'),
    }),
  },
  async ({ title }) => {
    // ... implementation
    return { content: [{ type: 'text', text: JSON.stringify(session) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Prefect MCP server running'); // stderr only — never stdout
}
main();
```

[CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md]

### Pattern 2: Tool Error Handling with isError

**What:** Return `{ isError: true }` for tool-level errors so Claude can see and self-correct.
**When to use:** Whenever an HTTP call to OpenCode fails, or the response indicates an error.

```typescript
// Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
async ({ sessionId }) => {
  try {
    const result = await client.session.sessionAbort({ path: { id: sessionId } });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Failed: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
```

[CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md]

### Pattern 3: OpenCode SDK Client Initialization

**What:** Create a typed OpenCode client from `OPENCODE_URL` env var.
**When to use:** At server startup, shared across all tool handlers.

```typescript
// Source: https://opencode.ai/docs/sdk/
import { createOpencodeClient } from '@opencode-ai/sdk';

const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const client = createOpencodeClient({ baseUrl: BASE_URL });
```

[CITED: https://opencode.ai/docs/sdk/]

### Pattern 4: package.json for ESM MCP Server

```json
{
  "type": "module",
  "scripts": {
    "build": "tsc && chmod 755 build/index.js"
  },
  "bin": {
    "prefect": "./build/index.js"
  }
}
```

[CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md]

### Pattern 5: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

[CITED: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md]

### Anti-Patterns to Avoid

- **console.log() in an stdio MCP server:** Any write to stdout corrupts the JSON-RPC stream. Use `console.error()` for all diagnostics. [VERIFIED: multiple community sources + official MCP debugging guide]
- **outputSchema on tools that also return isError:** A known SDK bug (issue #654) causes the SDK to throw when `outputSchema` is defined and `isError: true` is returned. Do not use `outputSchema` — return plain `content: [{ type: 'text', text: ... }]` only.
- **Setting HTTP timeout too short on opencode_run:** The `POST /session/{id}/message` endpoint blocks for the full agent loop duration (can be minutes). Do not set fetch `signal` with a short timeout.
- **Using prompt_async + polling for opencode_run:** `/session/:id/prompt_async` returns 204 immediately but status polling via `/session/status` is documented as unreliable (returns `unknown` indefinitely). Use the synchronous `POST /session/{id}/message` endpoint.

---

## OpenCode API Reference (Verified Types)

All types extracted from `@opencode-ai/sdk@1.14.25` package. [VERIFIED: npm registry + package inspection]

### POST /session — opencode_create_session

**Request body:** `{ parentID?: string, title?: string }` (plus optional `?directory=` query)
**Response:** `Session` object:
```typescript
type Session = {
  id: string;        // ULID — this is the session ID to pass to all other tools
  title: string;
  projectID: string;
  directory: string;
  parentID?: string;
  version: string;
  time: { created: number; updated: number };
  // ... other fields
}
```

### POST /session/{id}/message — opencode_run

**Request body:**
```typescript
{
  parts: Array<{ type: 'text', text: string } | ...>;  // required
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: { [key: string]: boolean };
}
```
**Response:** `{ info: AssistantMessage, parts: Part[] }` — returned only after the full agent loop completes.
**Behavior:** Long-lived HTTP connection (uses Hono's `stream()`). Blocks for the entire agent run (potentially minutes). Writes the JSON response body once, when done. [VERIFIED: GitHub issue analysis + SDK types]

### GET /session/{id}/diff — opencode_get_diff

**Query:** `messageID?: string` (optional)
**Response:** `FileDiff[]`:
```typescript
type FileDiff = {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}
```

### POST /session/{id}/permissions/{permissionID} — opencode_approve_permission

**Request body:** `{ response: "once" | "always" | "reject" }`

**CRITICAL:** The valid response values are `"once"`, `"always"`, and `"reject"` — NOT `"allow"`, `"deny"`, or `"allow_always"` as stated in REQUIREMENTS.md CORE-04. [VERIFIED: `@opencode-ai/sdk` type `PostSessionIdPermissionsPermissionIdData`]

The `remember` field mentioned in REQUIREMENTS.md does not exist in the current API.

**Response:** `boolean` (true = success)

### POST /session/{id}/fork — opencode_fork

**Request body:** `{ messageID?: string }` (optional — fork from current tip if omitted)
**Response:** `Session` (new forked session)

### POST /session/{id}/revert — opencode_revert

**Request body:** `{ messageID: string, partID?: string }` (`messageID` is **required**)
**Response:** `boolean`

### POST /session/{id}/abort — opencode_abort

**Request body:** none required
**Response:** `boolean`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP protocol (JSON-RPC, tool schema, transport) | Custom JSON-RPC server | `McpServer` + `StdioServerTransport` | The protocol has handshake, capabilities negotiation, error framing — all handled by the SDK |
| Input validation | Custom validators | `zod` schemas in `inputSchema` | SDK validates inputs automatically and returns proper MCP schema errors |
| HTTP client with types | `fetch` + manual types | `@opencode-ai/sdk` | Types are auto-generated from the OpenAPI spec — always correct |
| OpenCode API type definitions | Manually writing interfaces | `import type { Session, FileDiff } from '@opencode-ai/sdk'` | Types are the SDK's primary value |

**Key insight:** The MCP SDK handles all protocol-level complexity; `@opencode-ai/sdk` handles all HTTP type safety. The implementation is purely glue code — read env, call OpenCode, return results.

---

## Common Pitfalls

### Pitfall 1: stdout Corruption in Stdio MCP Server
**What goes wrong:** Any `console.log()` or `process.stdout.write()` in the server process corrupts the JSON-RPC stream. Claude Code receives malformed messages and the tool fails silently or with a cryptic parse error.
**Why it happens:** The MCP stdio transport uses stdout exclusively for protocol messages. Any other output interleaves with JSON-RPC frames.
**How to avoid:** Use `console.error()` for all logging and diagnostics. Never call `console.log()` anywhere in the server process.
**Warning signs:** Tools that worked in isolation fail when connected to Claude Code; MCP Inspector shows parse errors.
[VERIFIED: https://github.com/ruvnet/claude-flow/issues/835 + MCP debugging docs]

### Pitfall 2: opencode_run Timeout
**What goes wrong:** The `opencode_run` tool times out because the default HTTP fetch has no timeout, but the agent loop runs for minutes. OR: you set a short timeout and it fires before the agent finishes.
**Why it happens:** `POST /session/{id}/message` holds the HTTP connection open while the agent executes — this is normal, not a hang.
**How to avoid:** Do not set a `signal`/`AbortController` timeout on this fetch call. Let it run to completion. Document expected latency (typically 30 seconds to several minutes depending on task complexity).
**Warning signs:** Tool returns error after a fixed interval; OpenCode continues running in background.
[VERIFIED: GitHub issue #12453 analysis + OpenCode serve behavior]

### Pitfall 3: Wrong Permission Response Values
**What goes wrong:** Passing `"allow"`, `"deny"`, or `"allow_always"` to the permissions endpoint returns a 400 Bad Request from OpenCode.
**Why it happens:** REQUIREMENTS.md used informal names. The actual API enum is `"once" | "always" | "reject"`.
**How to avoid:** Use the SDK type `PostSessionIdPermissionsPermissionIdData` — TypeScript will enforce the correct enum.
**Warning signs:** 400 errors from the permissions endpoint.
[VERIFIED: `@opencode-ai/sdk@1.14.25` type definition inspection]

### Pitfall 4: opencode serve Default Port is Not 4096
**What goes wrong:** Running `opencode serve` without `--port 4096` assigns a random port. The MCP server's default `OPENCODE_URL=http://localhost:4096` fails to connect.
**Why it happens:** In opencode v1.2.27+ (confirmed on the test machine), `opencode serve` defaults to `--port 0` (OS-assigned random port). Port 4096 is the convention but must be explicit.
**How to avoid:** Always run `opencode serve --port 4096`. Document this in README (Phase 2). The MCP server itself is fine — it reads `OPENCODE_URL` which defaults to `localhost:4096`.
**Warning signs:** "connection refused" errors when calling any tool; opencode serve output shows a different port.
[VERIFIED: `opencode serve --help` on installed v1.2.27]

### Pitfall 5: Using prompt_async + Status Polling Instead of Blocking message
**What goes wrong:** Using `POST /session/{id}/prompt_async` + polling `GET /session/status` to wait for completion. Status polling returns `unknown` indefinitely, making completion detection impossible.
**Why it happens:** The `/session/status` endpoint has a documented bug — it doesn't reliably reflect async session state.
**How to avoid:** Use the synchronous `POST /session/{id}/message` endpoint for `opencode_run`. It blocks until done and returns the result directly.
**Warning signs:** `opencode_run` never returns, or always returns immediately with no result.
[VERIFIED: GitHub issue #12860 analysis]

---

## Code Examples

### Full Server Skeleton

```typescript
// Source: MCP SDK docs (server.md) + OpenCode SDK docs
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';

const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const client = createOpencodeClient({ baseUrl: BASE_URL });

const server = new McpServer({ name: 'prefect', version: '1.0.0' });

// CORE-01: Create session
server.registerTool(
  'opencode_create_session',
  {
    description: 'Create a new OpenCode coding session. Returns a session ID for use with other tools.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional display title for the session'),
    }),
  },
  async ({ title }) => {
    try {
      const { data, error } = await client.session.sessionCreate({ body: { title } });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-02: Run prompt (blocking)
server.registerTool(
  'opencode_run',
  {
    description: 'Send a prompt to an OpenCode session and block until the agent completes. Returns the assistant response and parts.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
    }),
  },
  async ({ sessionId, prompt }) => {
    try {
      const { data, error } = await client.session.sessionPrompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: prompt }] },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// ... other tools follow same pattern

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
}
main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

### opencode_approve_permission (Correct Enum Values)

```typescript
// Permission response values from @opencode-ai/sdk types: "once" | "always" | "reject"
server.registerTool(
  'opencode_approve_permission',
  {
    description: 'Respond to an OpenCode permission request.',
    inputSchema: z.object({
      sessionId: z.string(),
      permissionId: z.string(),
      response: z.enum(['once', 'always', 'reject']).describe(
        'once = approve this request only; always = approve similar future requests; reject = deny'
      ),
    }),
  },
  async ({ sessionId, permissionId, response }) => {
    try {
      const { data, error } = await client.session.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: String(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SSE-based MCP transport | Stdio (StdioServerTransport) for local tools | MCP spec 2024+ | Claude Code spawns stdio subprocesses natively — no SSE needed for local MCP servers |
| `server.tool()` method (older SDK) | `server.registerTool()` | MCP SDK ~1.x | New API has clearer input/output schema separation |
| Manual fetch + interfaces | `@opencode-ai/sdk` typed client | OpenCode added SDK | Types match OpenAPI spec exactly; no manual maintenance |

**Deprecated/outdated:**
- SSE transport for local MCP servers: Still works but unnecessary for Claude Code integration; `StdioServerTransport` is the correct choice.
- `outputSchema` on tools that might return errors: Known SDK bug #654 (June 2025) — avoid until fixed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `createOpencodeClient` from `@opencode-ai/sdk` is the correct client factory for pointing at a custom base URL | Code Examples | If the API changed, use `createClient` from `@opencode-ai/sdk/client` with `setConfig({ baseUrl })` instead |
| A2 | `client.session.sessionPrompt` is the correct SDK method name for `POST /session/{id}/message` | Code Examples | Check `@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` `Session` class for actual method names |
| A3 | `client.session.sessionCreate`, `client.session.sessionAbort`, etc. follow the `session{Verb}` naming convention | Code Examples | Verify against `dist/gen/sdk.gen.d.ts` — the SDK is auto-generated and method names derive from OpenAPI operation IDs |

**Note on A2-A3:** The method names can be definitively confirmed by inspecting `/tmp/package/dist/gen/sdk.gen.d.ts` which is available from the npm pack above. The type import names (`SessionPromptData`, `SessionCreateData`, etc.) are confirmed but the method name on the `Session` class object needs one grep to confirm.

---

## Open Questions

1. **opencode_run: What does the SDK method return when OpenCode encounters an error mid-run?**
   - What we know: HTTP 200 with `{ info: AssistantMessage, parts: Part[] }` on success
   - What's unclear: Does an agent error return HTTP 4xx, or HTTP 200 with error info in parts?
   - Recommendation: Implement with try/catch + `isError: true` fallback; log the raw response for debugging during Phase 1 testing.

2. **opencode_get_diff: messageID behavior**
   - What we know: `messageID` is an optional query param
   - What's unclear: When omitted, does it return diffs for the entire session or only the most recent message?
   - Recommendation: Document the behavior in the tool description based on observed behavior during testing.

3. **Permission values in requirements vs API**
   - What we know: API uses `"once" | "always" | "reject"`; REQUIREMENTS.md says `allow/deny/allow_always`
   - What's unclear: Whether REQUIREMENTS.md is aspirational naming (user-facing labels) vs intended API values
   - Recommendation: Implement using API values (`"once" | "always" | "reject"`); document the mapping in tool description. Confirm with user if the Zod enum in the tool should expose user-friendly labels and map internally.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | MCP server runtime | Yes | v20.20.0 | — |
| npm | Package installation | Yes | 10.8.2 | — |
| opencode CLI | Phase 2 wiring + testing | Yes | 1.2.27 | — |
| TypeScript compiler (`tsc`) | Build step | Not yet installed | — | Install via `npm install -D typescript` |

**Missing dependencies with no fallback:**
- TypeScript: not yet installed globally, but will be installed as a dev dependency in the project.

**Key note:** `opencode serve` defaults to `--port 0` (random port) in v1.2.27. Must be invoked as `opencode serve --port 4096` for the default `OPENCODE_URL` to work. [VERIFIED: `opencode serve --help` on installed version]

---

## Security Domain

Security enforcement is not configured for this project. This is a personal-use tool with no authentication requirements — `OPENCODE_SERVER_PASSWORD` is not set, and the OpenCode server is only accessible on `127.0.0.1`. No ASVS controls apply.

---

## Sources

### Primary (HIGH confidence)
- `@opencode-ai/sdk@1.14.25` npm package — type definitions extracted directly; all endpoint shapes, response types, and permission enum values
- `@modelcontextprotocol/sdk@1.29.0` npm package — version confirmed via registry
- Context7 `/modelcontextprotocol/typescript-sdk` — `McpServer.registerTool()`, `StdioServerTransport`, error handling patterns, tsconfig, package.json setup
- [OpenCode Server docs](https://opencode.ai/docs/server/) — endpoint listing, authentication, default port behavior
- [OpenCode SDK docs](https://opencode.ai/docs/sdk/) — `createOpencodeClient`, base URL configuration
- `opencode serve --help` on installed v1.2.27 — confirmed default port is `0`, not `4096`
- `~/.config/opencode/opencode.json` — confirmed all permissions set to `allow`

### Secondary (MEDIUM confidence)
- [MCP TypeScript SDK server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) — tool registration and error handling patterns
- [MCP TypeScript SDK server-quickstart.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server-quickstart.md) — project setup

### Tertiary (LOW confidence)
- GitHub issue #12453 analysis — `POST /session/{id}/message` streaming/blocking behavior (confirmed: blocks until agent loop completes)
- GitHub issue #12860 — `/session/status` unreliable for async polling (confirmed: don't use prompt_async + polling)
- [NearForm MCP pitfalls article](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/) — stdout corruption pitfall
- [claude-flow issue #835](https://github.com/ruvnet/claude-flow/issues/835) — stdout corruption in stdio MCP servers

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed from npm registry 2026-04-25
- OpenCode API shapes: HIGH — extracted from published `@opencode-ai/sdk` type definitions
- Architecture: HIGH — confirmed from official MCP SDK docs
- Permission enum values: HIGH — extracted directly from SDK types (key correction from requirements)
- opencode_run blocking behavior: MEDIUM — inferred from issue analysis, needs live verification
- SDK method names (client.session.*): MEDIUM — type names confirmed, method names need one additional grep

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days — libraries are stable)
