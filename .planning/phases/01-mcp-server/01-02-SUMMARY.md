---
phase: 01-mcp-server
plan: 02
subsystem: mcp-server-skeleton
tags:
  - typescript
  - mcp
  - opencode
  - server-skeleton

dependency_graph:
  requires:
    - 01-01 (package.json, tsconfig.json, node_modules, SDK method names)
  provides:
    - src/index.ts: runnable MCP server with 2 tools (opencode_create_session, opencode_abort)
    - build/index.js: compiled JS artifact ready for bin entry point
  affects:
    - .planning/phases/01-mcp-server/01-03-PLAN.md (adds 5 more tools to same file)

tech_stack:
  added: []
  patterns:
    - McpServer.registerTool() with zod inputSchema — no outputSchema (avoids SDK bug #654)
    - try/catch returning { content, isError: true } on error (Pattern 2 from RESEARCH.md)
    - OPENCODE_URL env var with http://localhost:4096 default (CORE-08)
    - stderr-only logging — never stdout (preserves JSON-RPC stream integrity)

key_files:
  created:
    - src/index.ts
  modified:
    - tsconfig.json (added types: ["node"] to fix TS2591 on process global)

decisions:
  - "Import paths: mcp.js + stdio.js (separate entry points) both resolved correctly — no fallback to index.js needed"
  - "SDK method names used: client.session.create() and client.session.abort() — confirmed from 01-01-SDK-METHODS.md"
  - "build/ is gitignored (correct) — compiled artifact is not version-tracked"

metrics:
  duration: "3 minutes"
  completed: "2026-04-26T22:17:14Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 02: MCP Server Skeleton Summary

**One-liner:** MCP server skeleton with StdioServerTransport, OPENCODE_URL env var wiring, and two tools (opencode_create_session via client.session.create, opencode_abort via client.session.abort) compiles and runs cleanly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write src/index.ts with skeleton + opencode_create_session + opencode_abort | 6aa03d9 | src/index.ts |
| 2 | Build project and smoke-test server start (includes tsconfig fix) | 3bcdf01 | tsconfig.json, build/index.js |

## Final Import Paths Used

Both `mcp.js` and `stdio.js` exist in the MCP SDK's `dist/esm/server/` directory and were used as specified in the plan. No fallback to `index.js` was needed.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

## Confirmed SDK Method Names

From `01-01-SDK-METHODS.md`:

| Tool | SDK Call |
|------|----------|
| opencode_create_session | `client.session.create({ body: { title? } })` |
| opencode_abort | `client.session.abort({ path: { id: sessionId } })` |

## Smoke Test Output

Default URL test:
```
Prefect MCP server running (OpenCode: http://localhost:4096)
```

OPENCODE_URL override test (`OPENCODE_URL=http://example.test:9999`):
```
Prefect MCP server running (OpenCode: http://example.test:9999)
```

Both tests confirmed the server starts, prints the startup banner, and reads the env var correctly (CORE-08 verified).

## Where Plan 03 Should Insert the Next 5 Tool Registrations

Insert the next 5 `server.registerTool(...)` blocks immediately before the `async function main()` line in `src/index.ts` (currently line 53). The file structure is designed for direct appension in that slot.

```typescript
// ... (existing opencode_abort tool ends here)

// INSERT NEXT 5 TOOLS HERE

async function main() {
  const transport = new StdioServerTransport();
```

## tsc Errors Encountered

One error hit during Task 2:
- **TS2591**: `Cannot find name 'process'` — tsconfig.json was missing `"types": ["node"]` even though `@types/node` was installed. Added `"types": ["node"]` to `compilerOptions` (Rule 1 auto-fix). Build succeeded after this fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing "types": ["node"] in tsconfig.json**
- **Found during:** Task 2 (first npm run build attempt)
- **Issue:** TypeScript reported TS2591 "Cannot find name 'process'" on `process.env.OPENCODE_URL` and `process.exit(1)`. The tsconfig had no `types` array, so TypeScript wasn't including `@types/node` even though it was installed in `devDependencies`.
- **Fix:** Added `"types": ["node"]` to `compilerOptions` in tsconfig.json.
- **Files modified:** tsconfig.json
- **Commit:** 3bcdf01

## Known Stubs

None — all tool handlers make real SDK calls, no placeholder data.

## Threat Flags

None — no new trust boundaries introduced. The two tools call existing OpenCode HTTP endpoints and wrap errors in `{ isError: true }` as required by T-01-02-03.

## Self-Check: PASSED

- [x] `src/index.ts` exists
- [x] First line is `#!/usr/bin/env node`
- [x] `process.env.OPENCODE_URL` present in src/index.ts
- [x] `http://localhost:4096` default present
- [x] `createOpencodeClient` import present
- [x] `StdioServerTransport` import present
- [x] `opencode_create_session` tool registered
- [x] `opencode_abort` tool registered
- [x] Exactly 2 `registerTool` calls
- [x] No `console.log` calls
- [x] No `outputSchema` fields
- [x] No `AbortController`/`signal:` usage
- [x] `npm run build` exits 0
- [x] `build/index.js` exists (gitignored, produced by tsc)
- [x] Smoke test: `Prefect MCP server running (OpenCode: http://localhost:4096)` confirmed
- [x] CORE-08 smoke test: `Prefect MCP server running (OpenCode: http://example.test:9999)` confirmed
- [x] Commit 6aa03d9: feat(01-02): write MCP server skeleton with opencode_create_session and opencode_abort
- [x] Commit 3bcdf01: fix(01-02): add node types to tsconfig to resolve process global
