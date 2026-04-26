---
phase: 01-mcp-server
plan: 01
subsystem: project-scaffolding
tags:
  - typescript
  - mcp
  - scaffolding
  - npm

dependency_graph:
  requires: []
  provides:
    - package.json with pinned ESM MCP server dependencies
    - tsconfig.json for Node16 ESM compilation
    - node_modules installed and ready
    - 01-01-SDK-METHODS.md with confirmed method names for Plans 02 and 03
  affects:
    - .planning/phases/01-mcp-server/01-02-PLAN.md
    - .planning/phases/01-mcp-server/01-03-PLAN.md

tech_stack:
  added:
    - "@modelcontextprotocol/sdk@1.29.0"
    - "@opencode-ai/sdk@1.14.25"
    - "zod@4.3.6"
    - "typescript@6.0.3"
    - "@types/node@latest"
  patterns:
    - ESM Node16 TypeScript project with bin entry point
    - npm install with exact version pinning (no ^ or ~ ranges)

key_files:
  created:
    - package.json
    - tsconfig.json
    - .gitignore
    - package-lock.json
    - .planning/phases/01-mcp-server/01-01-SDK-METHODS.md
  modified: []

decisions:
  - "SDK method naming: actual names are short verbs (create, prompt, abort) not session{Verb} as assumed in RESEARCH.md"
  - "Permissions endpoint: client.postSessionIdPermissionsPermissionId() is on the top-level client, not client.session"

metrics:
  duration: "3 minutes"
  completed: "2026-04-26T21:49:26Z"
  tasks_completed: 2
  files_created: 5
---

# Phase 01 Plan 01: TypeScript Project Scaffold Summary

**One-liner:** Node16 ESM TypeScript project scaffolded with 4 pinned MCP/OpenCode dependencies; SDK type inspection resolved all method name assumptions for Plans 02 and 03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write package.json, tsconfig.json, .gitignore | ec17ccc | package.json, tsconfig.json, .gitignore |
| 2 | Install dependencies and confirm SDK method names | cdffac4 | package-lock.json, .planning/phases/01-mcp-server/01-01-SDK-METHODS.md |

## Confirmed SDK Method Names

Copied from `01-01-SDK-METHODS.md` for quick reference:

| OpenCode Endpoint | SDK Call | MCP Tool |
|-------------------|----------|----------|
| POST /session | `client.session.create(...)` | opencode_create_session |
| POST /session/{id}/message | `client.session.prompt(...)` | opencode_run |
| GET /session/{id}/diff | `client.session.diff(...)` | opencode_get_diff |
| POST /session/{id}/permissions/{permId} | `client.postSessionIdPermissionsPermissionId(...)` | opencode_approve_permission |
| POST /session/{id}/fork | `client.session.fork(...)` | opencode_fork |
| POST /session/{id}/revert | `client.session.revert(...)` | opencode_revert |
| POST /session/{id}/abort | `client.session.abort(...)` | opencode_abort |

## TypeScript Config Status

`npx tsc --noEmit` with empty `src/` reports "TS18003: No inputs were found" — this is expected and acceptable per the plan. The tsconfig itself is valid; the error is only because `src/` contains no `.ts` files yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected SDK method names from RESEARCH.md assumptions**
- **Found during:** Task 2
- **Issue:** RESEARCH.md and PATTERNS.md assumed `session{Verb}` naming (e.g., `client.session.sessionCreate`, `client.session.sessionPrompt`). Inspection of the installed SDK's `dist/gen/sdk.gen.d.ts` shows actual method names are short verbs.
- **Fix:** SDK-METHODS.md documents the correct calls. Plans 02 and 03 must use `client.session.create()`, `client.session.prompt()`, etc. — NOT the `session{Verb}` variants.
- **Files modified:** `.planning/phases/01-mcp-server/01-01-SDK-METHODS.md`
- **Commit:** cdffac4

**2. [Rule 1 - Bug] Permissions endpoint is on top-level client, not client.session**
- **Found during:** Task 2
- **Issue:** RESEARCH.md and PATTERNS.md showed `client.session.postSessionIdPermissionsPermissionId(...)`. The actual SDK declares this method on `OpencodeClient` (the top-level client), not on the `Session` sub-class.
- **Fix:** SDK-METHODS.md documents `client.postSessionIdPermissionsPermissionId(...)` as the correct call. Plan 02 must use the top-level client method, not `client.session.*`.
- **Files modified:** `.planning/phases/01-mcp-server/01-01-SDK-METHODS.md`
- **Commit:** cdffac4

## Known Stubs

None — this plan produces config files and documentation only, no runtime stubs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced by this plan.

## Self-Check: PASSED

- [x] `package.json` exists at `/mnt/c/Users/larry/Documents/repos/personal/supervisor/package.json`
- [x] `tsconfig.json` exists at `/mnt/c/Users/larry/Documents/repos/personal/supervisor/tsconfig.json`
- [x] `.gitignore` exists at `/mnt/c/Users/larry/Documents/repos/personal/supervisor/.gitignore`
- [x] `.planning/phases/01-mcp-server/01-01-SDK-METHODS.md` exists
- [x] `node_modules/@opencode-ai/sdk` directory exists
- [x] `node_modules/@modelcontextprotocol/sdk` directory exists
- [x] `node_modules/zod` directory exists
- [x] Commit ec17ccc: chore(01-01): scaffold TypeScript project config files
- [x] Commit cdffac4: feat(01-01): install dependencies and document confirmed SDK method names
