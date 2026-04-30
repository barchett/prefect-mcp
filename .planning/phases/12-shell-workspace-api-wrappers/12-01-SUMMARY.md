---
phase: 12-shell-workspace-api-wrappers
plan: "01"
subsystem: mcp-tools
tags: [api-wrappers, workspace, shell, mcp-injection, tools-inspection, file-ops, vcs]
dependency_graph:
  requires: []
  provides:
    - prefect_vcs_info
    - prefect_file_status
    - prefect_list_mcp_servers
    - prefect_get_config
    - prefect_list_commands
    - prefect_session_shell
    - prefect_inject_mcp_server
    - prefect_list_tools
    - prefect_find_file
    - prefect_get_file_content
  affects:
    - src/index.ts
tech_stack:
  added: []
  patterns:
    - Analog A: directory-only inputSchema -> resolveDirectory() -> client.{ns}.{method}() -> JSON.stringify
    - Analog B: session tool with path: { id: sessionId } + required body fields
    - Analog C: POST with discriminated union body (McpLocalConfig | McpRemoteConfig)
    - Analog E: dual-endpoint branching on optional params (provider+model)
    - Analog D: required query param with destructure rename to avoid shadowing (query->fileQuery, path->filePath)
key_files:
  created: []
  modified:
    - src/index.ts
decisions:
  - "No changes to src/handlers.ts — all ten tools are thin wrappers registered directly in src/index.ts per Phase 12 plan constraint"
  - "McpLocalConfig discriminated union built inline with import('@opencode-ai/sdk').McpLocalConfig | import('@opencode-ai/sdk').McpRemoteConfig — no additional top-level import needed"
  - "prefect_list_tools branches on (provider && model) to route to client.tool.list() vs client.tool.ids() — TypeScript requires both params for client.tool.list()"
  - "prefect_get_file_content uses async (args) => with const { path: filePath } destructure to avoid shadowing import path from 'node:path'"
  - "prefect_find_file uses async (args) => with const { query: fileQuery } destructure to avoid collision with SDK query: key"
metrics:
  duration: "2m 55s"
  completed: "2026-04-30"
  tasks_completed: 3
  files_modified: 1
---

# Phase 12 Plan 01: Shell + Workspace API Wrappers Summary

Ten new MCP tools wrapping remaining OpenCode HTTP endpoints added to `src/index.ts` via thin-wrapper pattern: shell execution (SESSION-14), five simple workspace GETs (API-04/05/06/11/12), and four tools with elevated complexity (API-07 discriminated union POST, API-08 dual-endpoint branch, API-09/10 required param with rename).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Register five simple workspace tools (API-04,05,06,11,12) | 9eba65d | src/index.ts (+115 lines) |
| 2 | Register five complex tools (SESSION-14,API-07,API-08,API-09,API-10) | dae4a4d | src/index.ts (+180 lines) |
| 3 | Build verification — confirm zero TypeScript errors | dae4a4d | build/index.js (gitignored) |

## Ten Tools Registered (Requirement IDs)

| Tool | Requirement | SDK Method | Pattern |
|------|-------------|------------|---------|
| prefect_vcs_info | API-04 | client.vcs.get() | Analog A |
| prefect_file_status | API-05 | client.file.status() | Analog A |
| prefect_list_mcp_servers | API-06 | client.mcp.status() | Analog A |
| prefect_get_config | API-11 | client.config.get() | Analog A |
| prefect_list_commands | API-12 | client.command.list() | Analog A |
| prefect_session_shell | SESSION-14 | client.session.shell() | Analog B |
| prefect_inject_mcp_server | API-07 | client.mcp.add() | Analog C |
| prefect_list_tools | API-08 | client.tool.ids() / client.tool.list() | Analog E |
| prefect_find_file | API-09 | client.find.files() | Analog D |
| prefect_get_file_content | API-10 | client.file.read() | Analog D |

## Code Location in src/index.ts

- New code range: lines 1067–1361 (all ten tools)
- Task 1 tools (API-04,05,06,11,12): lines 1067–1180
- Task 2 tools (SESSION-14, API-07,08,09,10): lines 1182–1361
- `async function main()` remains at line 1362 (unchanged)
- Total `server.registerTool(` count: 40 (was 30 before Phase 12)

## Build Results

- `npm run build` exited 0 with zero TypeScript errors
- All ten tool name literals confirmed present in `build/index.js` via node -e artifact check
- No TypeScript casts (`as any`) needed — inline import for McpLocalConfig/McpRemoteConfig union resolved cleanly

## Anti-Pattern Avoidance

No anti-patterns triggered. All critical constraints respected:
- `client.mcp.status()` used (not `.list()`) for API-06
- `client.mcp.add()` used (not `.create()`) for API-07
- `client.find.files()` used (not `.file()`) for API-09
- `client.file.read()` used (not `.content()`) for API-10
- `client.tool.list()` only called inside `if (provider && model)` branch
- `commandArgs` uses `z.array(z.string())` not `z.string()`
- `dirs` uses `z.enum(['true', 'false'])` not `z.boolean()`
- `path` renamed to `filePath` in prefect_get_file_content
- `query` renamed to `fileQuery` in prefect_find_file

## Threat Model Compliance

All mitigations from the plan's STRIDE threat register applied:
- T-12-01: prefect_session_shell description contains explicit WARNING about arbitrary shell execution
- T-12-02: Zod validates all prefect_inject_mcp_server body fields (z.string(), z.enum, z.array(z.string()))
- T-12-03: prefect_get_config description notes response may contain sensitive data (API keys)
- T-12-04: directory param uses resolveDirectory() per Phase 5 locked design
- T-12-05: sessionId uses z.string(); errors propagated via existing project-wide error pattern
- T-12-06: Error responses use JSON.stringify(error) consistent with all 40 tools

## Containment Verification

- No changes to src/handlers.ts
- No new imports added to src/index.ts
- No new dependencies or env vars introduced
- `async function main()` block remains untouched

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all ten tools wire directly to live OpenCode SDK methods with no placeholder data.

## Threat Flags

None — all ten tools follow established project patterns. Security surface is documented in the plan's STRIDE threat register and mitigated as specified.

## Self-Check: PASSED

- src/index.ts: FOUND
- Commit 9eba65d (Task 1): FOUND
- Commit dae4a4d (Task 2): FOUND
- 12-01-SUMMARY.md: FOUND
