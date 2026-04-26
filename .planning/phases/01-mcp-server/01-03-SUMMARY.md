---
phase: 01-mcp-server
plan: 03
subsystem: mcp-server
tags:
  - typescript
  - mcp
  - opencode
  - tools

dependency_graph:
  requires:
    - phase: 01-02
      provides: src/index.ts skeleton with opencode_create_session and opencode_abort registered
  provides:
    - src/index.ts: complete MCP server with all 7 OpenCode tools registered
    - build/index.js: recompiled JS artifact with all 7 tools present
  affects:
    - Phase 2 (Claude Code integration — all 7 tools now visible to the MCP client)

tech-stack:
  added: []
  patterns:
    - client.session.prompt() for opencode_run (blocks until agent loop completes, no AbortController)
    - client.session.diff() with optional query.messageID for opencode_get_diff
    - client.postSessionIdPermissionsPermissionId() at TOP-LEVEL client (not client.session) for opencode_approve_permission
    - client.session.fork() with optional body.messageID for opencode_fork
    - client.session.revert() with required body.messageID, optional body.partID for opencode_revert
    - z.enum(['once', 'always', 'reject']) — API-correct enum (NOT REQUIREMENTS.md's allow/deny/allow_always)
    - Conditional body spread for optional fields: `messageID ? { messageID } : {}`

key-files:
  created: []
  modified:
    - src/index.ts (added 5 tool registrations, 63 → 192 lines)

key-decisions:
  - "opencode_approve_permission uses client.postSessionIdPermissionsPermissionId (top-level client) — confirmed from 01-01-SDK-METHODS.md; client.session has no permissions method"
  - "Permission response enum is z.enum(['once', 'always', 'reject']) — REQUIREMENTS.md CORE-04 states allow/deny/allow_always which is WRONG; API enum deliberately used instead; REQUIREMENTS.md should be updated in a future doc-only plan"
  - "opencode_run has no AbortController/signal — POST /session/{id}/message is a long-lived blocking HTTP request that holds until the agent loop completes (RESEARCH.md Pitfall 2)"
  - "opencode_revert.messageID has no .optional() — the API requires it (confirmed from SDK types)"
  - "Server banner appears after MCP initialize handshake completes (server.connect resolves after first initialize message) — smoke test with /dev/null stdin exits 0 with banner"

patterns-established:
  - "All 7 tools follow identical try/catch pattern: call SDK, throw on error, return { content: [{ type: 'text', text: ... }] }"
  - "Optional body fields use conditional spread: ...(field ? { field } : {})"
  - "Required messageID in revert is enforced at Zod schema level (z.string() without .optional())"

requirements-completed:
  - CORE-02
  - CORE-03
  - CORE-04
  - CORE-05
  - CORE-06

duration: 12min
completed: 2026-04-26
---

# Phase 01 Plan 03: Add Remaining 5 MCP Tools Summary

**Five tools added to MCP server (opencode_run, opencode_get_diff, opencode_approve_permission, opencode_fork, opencode_revert) completing all 7 CORE tools; API-correct permission enum z.enum(['once','always','reject']) used instead of REQUIREMENTS.md's incorrect allow/deny/allow_always.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-26T22:20:00Z
- **Completed:** 2026-04-26T22:32:00Z
- **Tasks:** 2 (1 source edit + 1 build verification)
- **Files modified:** 1 (src/index.ts)

## Accomplishments

- Added 5 tool registrations to src/index.ts (63 lines → 192 lines), completing all 7 CORE tools
- Correctly wired `opencode_approve_permission` to the top-level `client.postSessionIdPermissionsPermissionId` (not `client.session.*`) per confirmed SDK method names
- Enforced API-correct permission enum `z.enum(['once', 'always', 'reject'])` at the Zod schema boundary, rejecting any other value before it reaches OpenCode
- `npm run build` exits 0 with zero TypeScript errors; all 7 tool names confirmed present in `build/index.js`
- Server smoke test: `node build/index.js < /dev/null 2>&1` prints `Prefect MCP server running (OpenCode: http://localhost:4096)` and exits 0

## Confirmed SDK Method Names (all 7 tools)

| MCP Tool | SDK Call |
|----------|----------|
| opencode_create_session | `client.session.create({ body: { title? } })` |
| opencode_run | `client.session.prompt({ path: { id }, body: { parts: [...] } })` |
| opencode_get_diff | `client.session.diff({ path: { id }, query: { messageID? } })` |
| opencode_approve_permission | `client.postSessionIdPermissionsPermissionId({ path: { id, permissionID }, body: { response } })` |
| opencode_fork | `client.session.fork({ path: { id }, body: { messageID? } })` |
| opencode_revert | `client.session.revert({ path: { id }, body: { messageID, partID? } })` |
| opencode_abort | `client.session.abort({ path: { id } })` |

## 7-Tool Verification Output (from build/index.js)

```
OK opencode_create_session
OK opencode_run
OK opencode_get_diff
OK opencode_approve_permission
OK opencode_fork
OK opencode_revert
OK opencode_abort
```

## Final src/index.ts Line Count

192 lines (was 64 lines after Plan 02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 tool registrations to src/index.ts** - `0506e85` (feat)
2. **Task 2: Build verification** - no separate commit (build/index.js is gitignored; verification-only task)

## Files Created/Modified

- `src/index.ts` — Added 5 tool registrations (opencode_run, opencode_get_diff, opencode_approve_permission, opencode_fork, opencode_revert) between existing opencode_abort registration and async function main()

## Decisions Made

1. **API-correct permission enum over REQUIREMENTS.md:** REQUIREMENTS.md CORE-04 specifies `allow/deny/allow_always` but the actual OpenCode API enum (confirmed from `@opencode-ai/sdk` types at `types.gen.d.ts` line 2509) is `"once" | "always" | "reject"`. The API-correct values were used. REQUIREMENTS.md should be updated in a future doc-only plan to reflect the actual API enum.

2. **No AbortController on opencode_run:** The `POST /session/{id}/message` endpoint is a long-lived blocking HTTP call that holds until the entire agent loop completes (potentially minutes). Adding a timeout or AbortController would incorrectly terminate in-progress agent work. Claude Code's orchestration layer handles tool timeouts.

3. **messageID required (not optional) in opencode_revert:** The OpenCode API requires `messageID` in the revert body. Zod schema uses `z.string()` without `.optional()` so missing calls fail at the MCP boundary with a clear schema error rather than reaching OpenCode with a malformed body.

4. **opencode_fork uses conditional spread for body:** The SDK type for `session.fork` may require a body even when messageID is absent. Using `body: messageID ? { messageID } : {}` ensures a valid (empty) body object is always sent.

## Deviations from Plan

None — plan executed exactly as written. The two verification regex false positives (matching comment text "allow/deny/allow_always" and "No AbortController / signal") were expected and the underlying code is correct: those strings appear only in explanatory comments, not in any code path.

## Known Stubs

None — all tool handlers make real SDK calls with correct method names and shapes.

## Threat Flags

None — the threat register items (T-01-03-01 through T-01-03-06) were all addressed:
- T-01-03-01: `z.enum(['once', 'always', 'reject'])` enforced at Zod boundary
- T-01-03-02: `messageID` required (no `.optional()`) in opencode_revert Zod schema
- T-01-03-03 through T-01-03-06: accepted risks per design

## Issues Encountered

None — TypeScript compilation succeeded on the first attempt with zero errors.

## REQUIREMENTS.md Update Recommendation

REQUIREMENTS.md CORE-04 states the permission response enum as `allow/deny/allow_always`. This is incorrect — the OpenCode API uses `once/always/reject`. A future doc-only plan should update REQUIREMENTS.md to reflect the actual API. The implementation uses the correct enum; the mismatch is documentation-only.

## Next Phase Readiness

Phase 1 MCP server is complete. All 7 tools are registered with correct schemas, correct SDK method calls, and no forbidden patterns. Phase 2 (Claude Code integration) can wire up this server and begin end-to-end testing of all 7 tools against a running OpenCode instance.

---
*Phase: 01-mcp-server*
*Completed: 2026-04-26*

## Self-Check: PASSED

- [x] `grep -c "registerTool" src/index.ts` outputs `7`
- [x] `opencode_run` present in src/index.ts and build/index.js
- [x] `opencode_get_diff` present in src/index.ts and build/index.js
- [x] `opencode_approve_permission` present in src/index.ts and build/index.js
- [x] `opencode_fork` present in src/index.ts and build/index.js
- [x] `opencode_revert` present in src/index.ts and build/index.js
- [x] `z.enum(['once', 'always', 'reject'])` in src/index.ts
- [x] No `console.log` in src/index.ts (only `console.error`)
- [x] No `outputSchema` in src/index.ts
- [x] No `AbortController` or `signal:` used in code (comments only)
- [x] `messageID: z.string()` (no `.optional()`) in opencode_revert
- [x] `messageID: z.string().optional()` in opencode_get_diff and opencode_fork
- [x] `npm run build` exits 0
- [x] `build/index.js` exists and contains all 7 tool names
- [x] `node build/index.js < /dev/null 2>&1` prints "Prefect MCP server running (OpenCode: http://localhost:4096)"
- [x] Commit 0506e85: feat(01-03): add 5 remaining tool registrations to MCP server
- [x] SUMMARY.md created at .planning/phases/01-mcp-server/01-03-SUMMARY.md
