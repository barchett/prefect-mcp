---
phase: 08-read-only-api-wrappers
plan: "01"
subsystem: mcp-tools
tags: [api-wrappers, read-only, opencode-sdk, phase8]
dependency_graph:
  requires: []
  provides: [opencode_list_agents, opencode_list_providers, opencode_find_symbol]
  affects: [src/index.ts]
tech_stack:
  added: [node:path]
  patterns: [resolveDirectory, conditional-directory-query, spread-query-form, field-projection-mapping]
key_files:
  modified:
    - path: src/index.ts
      delta: "+93 lines (3 tool registrations + 1 import line)"
decisions:
  - "D-01: opencode_list_agents returns { name, description, mode } only — builtIn and permission stripped (T-08-03)"
  - "D-03: opencode_list_providers unwraps data.all array, discards { all: [...] } wrapper"
  - "D-04: model entries trimmed to { id, name } — release_date, cost, limits, capabilities, env, api, npm excluded (T-08-01)"
  - "D-06: opencode_find_symbol converts file:// URI to project-relative path when dir is resolved (T-08-02)"
  - "D-07: falls back to absolute path when dir is undefined — never injects process.cwd() (Phase 5 locked decision)"
  - "D-08: symbolQuery destructure avoids shadowing SDK query object; spread query form for required+optional fields"
  - "D-09: all three tools registered inline in src/index.ts (no handlers.ts extraction needed)"
metrics:
  duration: "2m"
  completed: "2026-04-28T20:39:32Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 1
---

# Phase 8 Plan 01: Read-only API Wrappers Summary

**One-liner:** Three read-only MCP tools wrapping GET /agent, GET /provider, GET /find/symbol via client.app.agents, client.provider.list, client.find.symbols with field-projection response transforms and project-relative path conversion.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | opencode_list_agents (API-01) | 32ad4ce | src/index.ts (+28 lines) |
| 2 | opencode_list_providers (API-02) | b014680 | src/index.ts (+28 lines) |
| 3 | opencode_find_symbol (API-03) + node:path import | 106d42b | src/index.ts (+36 lines, +1 import) |

## What Was Built

### opencode_list_agents (API-01)
- Wraps `GET /agent` via `client.app.agents({ query: dir ? { directory: dir } : undefined })`
- Response projection: `Array<{ name, description?, mode }>` — strips `builtIn`, `permission`, internal model defaults
- Accepts optional `directory` param via `resolveDirectory()`, matching all existing tools

### opencode_list_providers (API-02)
- Wraps `GET /provider` via `client.provider.list({ query: dir ? { directory: dir } : undefined })`
- Unwraps `data.all` array (strips `{ all: [...] }` wrapper)
- Uses `Object.values(p.models)` to convert models dict to array
- Model entries trimmed to `{ id, name }` — excludes `release_date`, cost, limits, capabilities, `env`, `api`, `npm`
- Returns `Array<{ id, name, models: Array<{ id, name }> }>`

### opencode_find_symbol (API-03)
- Added `import path from 'node:path'` to import block (line 7, after `createPatch` import)
- Wraps `GET /find/symbol` via `client.find.symbols({ query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) } })`
- Destructures handler args as `{ query: symbolQuery, directory }` to avoid shadowing the SDK `query` object
- URI conversion: `sym.location.uri.replace(/^file:\/\//, '')` strips `file://` prefix
- Path relativization: `path.relative(dir, absolutePath)` when `dir` is truthy (D-06); absolute path fallback when `dir` is `undefined` (D-07)
- Returns `Array<{ name, kind, path, range }>` — includes LSP SymbolKind number, excludes raw `uri`

## Build Output

```
> prefect@1.0.0 build
> tsc && chmod 755 build/index.js build/cli.js

Exit code: 0
```

Zero TypeScript errors. Tool count: 22 (pre-Phase-8) → 25 (post-Phase-8).

## CONTEXT.md Decision Compliance

| Decision | Implemented | Notes |
|----------|-------------|-------|
| D-01: name not remapped to id | ✓ | Projection uses `a.name`, `a.description`, `a.mode` |
| D-02: client.app.agents() call | ✓ | Conditional directory query |
| D-03: unwrap data.all | ✓ | `data?.all ?? []` |
| D-04: trim model fields | ✓ | `Object.values(p.models).map(m => ({ id: m.id, name: m.name }))` |
| D-05: client.provider.list() call | ✓ | Conditional directory query |
| D-06: file:// strip + path.relative | ✓ | When dir is truthy |
| D-07: absolute path fallback, no process.cwd() | ✓ | `dir ? path.relative(...) : absolutePath` |
| D-08: spread query form for find.symbols | ✓ | `{ query: symbolQuery, ...(dir ? { directory: dir } : {}) }` |

## Threat Model Mitigations

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-08-01: provider metadata disclosure | Models trimmed to `{ id, name }` only | ✓ `grep -E "release_date|p\.env"` returns no matches |
| T-08-02: absolute path disclosure | `path.relative(dir, absolutePath)` when dir known | ✓ `grep "path.relative"` returns match |
| T-08-03: agent config disclosure | Returns `{ name, description, mode }` only | ✓ `builtIn`, `permission` excluded |
| T-08-05: auth propagation | All tools use existing module-scope `client` instance | ✓ No new `createOpencodeClient` call added |

## Deviations from Plan

None — plan executed exactly as written. All three tool registrations match the exact code blocks specified in the PLAN.md task actions. No bugs encountered, no missing functionality, no blocking issues.

## Known Stubs

None. All three tools wire directly to live OpenCode SDK endpoints with no placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

- [x] `src/index.ts` modified and committed (commits: 32ad4ce, b014680, 106d42b)
- [x] `grep -c "registerTool" src/index.ts` = 25
- [x] `grep -c "'opencode_list_agents'" src/index.ts` = 1
- [x] `grep -c "'opencode_list_providers'" src/index.ts` = 1
- [x] `grep -c "'opencode_find_symbol'" src/index.ts` = 1
- [x] `grep -c "import path from 'node:path'" src/index.ts` = 1
- [x] `npm run build` exits 0 with zero TypeScript errors
- [x] Existing 22 tools unchanged (all 7 reference tools each appear exactly once)
- [x] No `process.cwd()` in find_symbol handler
- [x] SUMMARY.md committed
