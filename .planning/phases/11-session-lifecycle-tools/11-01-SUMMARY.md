---
phase: 11-session-lifecycle-tools
plan: "01"
subsystem: mcp-tools
tags:
  - mcp
  - opencode-sdk
  - session-lifecycle
  - typescript
dependency_graph:
  requires:
    - src/index.ts (existing 25 tools + imports)
    - src/config.ts (resolveDirectory)
    - "@opencode-ai/sdk client.session.*"
  provides:
    - prefect_session_summarize (SESSION-11)
    - prefect_session_todo (SESSION-12)
    - prefect_session_init (SESSION-13)
    - prefect_session_share (SESSION-15)
    - prefect_session_unshare (SESSION-16)
  affects:
    - build/index.js (compiled artifact with 5 new tool names)
tech_stack:
  added: []
  patterns:
    - "Standard session tool registration: Zod schema -> resolveDirectory -> client.session.{method} -> if(error)throw -> JSON.stringify(data)"
key_files:
  created: []
  modified:
    - src/index.ts
decisions:
  - "Used 'body as { modelID: string; providerID: string; messageID: string } | undefined' cast for session.init to satisfy SDK types while allowing partial body — runtime conditional-spread logic stays intact"
  - "Only include summarize body when BOTH providerID AND modelID present (they are required together within body per SDK types)"
  - "todo/share/unshare handlers pass no body (body?: never in SDK types)"
metrics:
  duration: ~5 minutes
  completed: "2026-04-30T01:38:54Z"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
---

# Phase 11 Plan 01: Session Lifecycle Tools Summary

Five new MCP tools wrapping OpenCode session lifecycle endpoints registered in src/index.ts: prefect_session_summarize, prefect_session_todo, prefect_session_init, prefect_session_share, prefect_session_unshare.

## Status

**Task 1:** Complete (commit 958ef49)
**Task 2:** Awaiting human smoke test (checkpoint:human-verify)

## Tools Registered

| Tool | Requirement | SDK Method | Return Type | Notes |
|------|-------------|------------|-------------|-------|
| prefect_session_summarize | SESSION-11 | client.session.summarize() | boolean | Optional body only when both providerID+modelID present |
| prefect_session_todo | SESSION-12 | client.session.todo() | Array<Todo> | No body (GET endpoint) |
| prefect_session_init | SESSION-13 | client.session.init() | boolean | Conditional-spread body; body cast to SDK shape |
| prefect_session_share | SESSION-15 | client.session.share() | Session | No body; share URL at session.share.url |
| prefect_session_unshare | SESSION-16 | client.session.unshare() | Session | No body; share field absent after call |

## Code Location

New tool registrations in `src/index.ts` lines 912–1051 (inclusive), immediately before `async function main()` at line 1052.

The five blocks are inserted in order: summarize (SESSION-11), todo (SESSION-12), init (SESSION-13), share (SESSION-15), unshare (SESSION-16).

## Build Verification

`npm run build` exits 0 with zero TypeScript errors.

`build/index.js` contains all five tool name literals (verified via node -e string check).

## Acceptance Criteria Results

| Check | Result |
|-------|--------|
| `grep -c "server.registerTool(" src/index.ts` = 30 | 30 PASS |
| All five tool names present in src/index.ts | PASS |
| All five client.session.* calls present | PASS |
| `grep -c "resolveDirectory(directory)" src/index.ts` = 30 | 30 PASS |
| Import block unchanged (head -15) | PASS |
| todo handler passes no body | PASS |
| share handler passes no body | PASS |
| unshare handler passes no body | PASS |
| None of five tools in src/handlers.ts | PASS |
| npm run build exits 0 | PASS |
| all five tool names in build/index.js | PASS |

## Deviations from Plan

None. Plan executed exactly as written.

The `body as { modelID: string; providerID: string; messageID: string } | undefined` cast in the init handler was anticipated in the plan (NOTE on the `body as` cast section) and did not require softening to `as any` — the direct cast compiled without error.

## Known Stubs

None. All five tools are fully wired to their SDK methods. No placeholder values, no hardcoded empty returns.

## Threat Flags

None. All five tools follow the project-wide pattern. No new network endpoints, auth paths, or schema changes introduced beyond what is documented in the plan's threat model.

## Self-Check

To be performed after SUMMARY commit.
