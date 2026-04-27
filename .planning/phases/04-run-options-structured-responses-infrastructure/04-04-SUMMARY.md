---
phase: 04-run-options-structured-responses-infrastructure
plan: "04"
subsystem: cli
tags:
  - cli
  - init
  - mcp-config
  - infra
dependency_graph:
  requires: []
  provides:
    - src/cli.ts: prefect init CLI with four-case D-17 merge logic
    - build/cli.js: compiled executable CLI entry point
  affects:
    - package.json bin field now routes `prefect` binary to build/cli.js
    - package.json build script chmods both build artifacts
    - package.json test script covers both parts.test.js and cli.test.js
tech_stack:
  added:
    - src/cli.ts (new file — ESM CLI, Node built-ins only, no new deps)
    - src/cli.test.ts (new file — integration tests via node:test + spawnSync)
  patterns:
    - ESM __dirname equivalent via fileURLToPath(import.meta.url)
    - merge-not-overwrite JSON config editing
    - spawnSync-based CLI integration testing with tmp dir isolation
key_files:
  created:
    - src/cli.ts
    - src/cli.test.ts
  modified:
    - package.json (bin, build script, test script)
decisions:
  - "Repoint single bin key 'prefect' to ./build/cli.js per D-16 — no second bin key; Claude Code spawns MCP server via args list in .mcp.json, not via the bin binary"
  - "Manual process.argv parsing over Commander.js — surface is minimal (one subcommand, one flag); zero additional deps"
  - "Tasks executed in dependency order: package.json (Task 2) before build verification, then tests (Task 3)"
metrics:
  duration_seconds: 189
  completed_date: "2026-04-27"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 04 Plan 04: prefect init CLI Summary

**One-liner:** `prefect init` CLI with four-case merge-not-overwrite semantics, absolute path resolution via `fileURLToPath(import.meta.url)`, and 6 integration tests via `node:test` + `spawnSync`.

## What Was Built

### src/cli.ts

New ESM entry point compiled to `build/cli.js`. Implements `prefect init [--force]` with four merge cases (D-17):

| Case | Condition | Behavior |
|------|-----------|----------|
| 1 | No `.mcp.json` | Create with prefect entry only |
| 2 | `.mcp.json` exists, no prefect key | Add prefect entry, preserve all other keys |
| 3 | `.mcp.json` exists, prefect key present, no `--force` | Exit 1, stderr mentions `--force` |
| 4 | `.mcp.json` exists, prefect key present, `--force` | Overwrite only the prefect key, preserve siblings |

The `.mcp.json` template written by the CLI:
```json
{
  "mcpServers": {
    "prefect": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/build/index.js"],
      "env": {}
    }
  }
}
```

The absolute path is resolved at runtime via:
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpServerPath = resolve(__dirname, 'index.js');
```

This works correctly from both a global install and a local clone because `build/cli.js` and `build/index.js` are always siblings in the same directory.

### package.json changes

- `bin.prefect`: `./build/index.js` → `./build/cli.js`
- `scripts.build`: `tsc && chmod 755 build/index.js` → `tsc && chmod 755 build/index.js build/cli.js`
- `scripts.test`: extended to include `build/cli.test.js` alongside `build/parts.test.js`

### src/cli.test.ts

Six integration tests using Node's built-in `node:test` runner and `spawnSync`. Each test runs in an isolated `mkdtempSync` directory cleaned up in `finally`.

| Test | Behavior Verified |
|------|-------------------|
| Case 1 | No `.mcp.json` → created with correct shape, exit 0 |
| Case 2 | Existing `.mcp.json` with `other` key → both keys present after init |
| Case 3 | Existing prefect key without `--force` → exit 1, stderr matches `/--force/`, file unchanged |
| Case 4 | `--force` → overwrites only prefect, preserves sibling `other` |
| Root key preservation | `theme: "dark"` at root level survives any merge path |
| Bogus subcommand | Exit 1, usage on stderr, no `.mcp.json` created |

## Verification Results

```
npm run build  →  green (tsc + chmod 755 build/index.js build/cli.js)
node --test build/cli.test.js  →  # pass 6  # fail 0
npm test  →  # pass 17 (6 CLI + 11 parts)  # fail 0
```

## Deviations from Plan

None — plan executed exactly as written. Tasks were committed in plan order (Task 1: src/cli.ts, Task 2: package.json, Task 3: cli.test.ts + test script). Build was verified jointly after both Task 1 and Task 2 were written, as noted in the plan's acceptance criteria.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b9e2d29 | feat(04-04): add src/cli.ts implementing prefect init with merge-not-overwrite logic |
| 2 | c658d48 | feat(04-04): update package.json bin to build/cli.js and extend build chmod |
| 3 | 9d72f20 | test(04-04): add integration tests for prefect init four merge cases |

## Self-Check

- [x] src/cli.ts exists and has `#!/usr/bin/env node` shebang
- [x] src/cli.test.ts exists with 6 test() calls
- [x] package.json bin.prefect = ./build/cli.js
- [x] package.json build script chmods both artifacts
- [x] package.json test script includes both test files
- [x] All three commits exist in git log
- [x] 17/17 tests pass via `npm test`
