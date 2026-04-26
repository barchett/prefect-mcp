# Phase 1: MCP Server - Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 3 (src/index.ts, package.json, tsconfig.json)
**Analogs found:** 0 / 3 (greenfield project — no existing source files)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` | service | request-response | none — greenfield | no analog |
| `package.json` | config | — | none — greenfield | no analog |
| `tsconfig.json` | config | — | none — greenfield | no analog |

---

## No Analog Found

This is a greenfield project. No source files exist in the repository. The only files present are planning documents under `.planning/`. All patterns below are drawn from the verified code examples in `01-RESEARCH.md`.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/index.ts` | service | request-response | No TypeScript source exists yet |
| `package.json` | config | — | No package.json exists yet |
| `tsconfig.json` | config | — | No tsconfig.json exists yet |

---

## Pattern Assignments

### `src/index.ts` (service, request-response)

**Analog:** none — use RESEARCH.md code examples directly

**Imports pattern** (RESEARCH.md "Full Server Skeleton"):
```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
```

**Client initialization pattern** (RESEARCH.md Pattern 3):
```typescript
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const client = createOpencodeClient({ baseUrl: BASE_URL });
```

**Server + tool registration pattern** (RESEARCH.md Pattern 1):
```typescript
const server = new McpServer({ name: 'prefect', version: '1.0.0' });

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
```

**Error handling pattern** (RESEARCH.md Pattern 2):
```typescript
// Every tool handler uses this exact structure — no variations
try {
  const { data, error } = await client.session.someMethod({ ... });
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return {
    content: [{ type: 'text', text: String(err) }],
    isError: true,
  };
}
```

**Entry point / transport connect pattern** (RESEARCH.md "Full Server Skeleton"):
```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);  // stderr only
}
main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

**Permission tool pattern** (RESEARCH.md "opencode_approve_permission"):
```typescript
// Correct enum values: "once" | "always" | "reject"
// NOT "allow" | "deny" | "allow_always" (REQUIREMENTS.md is wrong here)
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

**Run tool pattern** (RESEARCH.md CORE-02 — long-lived blocking HTTP):
```typescript
// No AbortController / timeout signal — POST /session/{id}/message blocks
// for the full agent loop (potentially minutes). Setting a short timeout breaks it.
server.registerTool(
  'opencode_run',
  {
    description: 'Send a prompt to an OpenCode session and block until the agent completes.',
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
```

---

### `package.json` (config)

**Analog:** none — use RESEARCH.md Pattern 4 directly

**Required fields pattern** (RESEARCH.md Pattern 4):
```json
{
  "name": "prefect",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc && chmod 755 build/index.js"
  },
  "bin": {
    "prefect": "./build/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "@opencode-ai/sdk": "1.14.25",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "typescript": "6.0.3",
    "@types/node": "latest"
  }
}
```

Note: `"type": "module"` is required — the MCP SDK uses ESM imports (`.js` extension in import paths).

---

### `tsconfig.json` (config)

**Analog:** none — use RESEARCH.md Pattern 5 directly

**Required compiler options** (RESEARCH.md Pattern 5):
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

Note: `"module": "Node16"` + `"moduleResolution": "Node16"` is required for ESM with `@modelcontextprotocol/sdk/server/index.js` path imports.

---

## Shared Patterns

### Logging — stderr only
**Source:** RESEARCH.md Anti-Patterns + Pitfall 1
**Apply to:** `src/index.ts` everywhere
```typescript
// CORRECT — safe for stdio MCP server
console.error('message');

// FORBIDDEN — corrupts the JSON-RPC stream over stdout
// console.log('message');   // never use this
// process.stdout.write(...); // never use this
```

### Tool Return Shape
**Source:** RESEARCH.md Pattern 2
**Apply to:** All 7 tool handlers in `src/index.ts`
```typescript
// Success
return { content: [{ type: 'text', text: JSON.stringify(data) }] };

// Error
return { content: [{ type: 'text', text: String(err) }], isError: true };

// FORBIDDEN — known SDK bug #654: outputSchema + isError throws
// Do NOT use outputSchema on any tool
```

### SDK Method Name Uncertainty
**Source:** RESEARCH.md Assumptions Log A2-A3
**Apply to:** All tool handlers in `src/index.ts`

The OpenCode SDK method names on `client.session.*` are auto-generated from OpenAPI operation IDs. The RESEARCH.md examples use `sessionCreate`, `sessionPrompt`, `sessionAbort`, etc. — these follow `session{Verb}` convention but must be verified against the installed package's type definitions at `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` before finalizing.

### Shebang for bin entry point
**Source:** RESEARCH.md Pattern 4 (implied by `chmod 755`)
**Apply to:** `src/index.ts` first line
```typescript
#!/usr/bin/env node
```

---

## Implementation Order

The planner should sequence tasks in this order to enable incremental testing:

1. `package.json` + `tsconfig.json` — project scaffolding; enables `npm install` and `tsc`
2. `src/index.ts` skeleton — McpServer + transport connect, no tools yet; verifies stdio wiring
3. `opencode_create_session` tool — simplest endpoint (POST /session, no path params)
4. `opencode_abort` tool — simplest session tool (no body, no optional params)
5. `opencode_run` tool — most complex (blocking HTTP, long-lived connection)
6. `opencode_get_diff` tool — GET with optional query param
7. `opencode_approve_permission` tool — enum validation, critical to get right
8. `opencode_fork` + `opencode_revert` tools — optional params, complete the set

---

## Critical Constraints for Planner

These RESEARCH.md findings must surface as explicit plan steps or notes:

| Constraint | File | What to Do |
|------------|------|------------|
| Never use `console.log()` | `src/index.ts` | Use `console.error()` everywhere |
| No `outputSchema` on any tool | `src/index.ts` | Omit `outputSchema` — SDK bug #654 breaks error returns |
| No timeout on `opencode_run` fetch | `src/index.ts` | Do not pass `signal` to the `sessionPrompt` call |
| Permission enum is `"once"\|"always"\|"reject"` | `src/index.ts` | Use `z.enum(['once', 'always', 'reject'])` — NOT `allow/deny/allow_always` |
| Verify SDK method names | `src/index.ts` | After `npm install`, grep `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` for actual method names |
| `opencode serve --port 4096` | README / docs | Document that the default port is random; `--port 4096` is required |

---

## Metadata

**Analog search scope:** `/mnt/c/Users/larry/Documents/repos/personal/supervisor/src` (does not exist yet)
**Files scanned:** 0 source files (project is greenfield)
**Pattern extraction date:** 2026-04-25
**All patterns sourced from:** `.planning/phases/01-mcp-server/01-RESEARCH.md`
