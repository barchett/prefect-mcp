---
phase: 09-npm-distribution
plan: "02"
subsystem: distribution
tags:
  - npm-publishing
  - global-install
  - documentation
  - cli
dependency_graph:
  requires:
    - "09-01"
  provides:
    - global-install-detection
    - two-mode-prefect-entry
    - prefect-star-docs
    - npm-pack-verification
  affects:
    - src/cli.ts
    - CLAUDE.md
    - README.md
    - examples/test-task.md
tech_stack:
  added: []
  patterns:
    - path-segment global install detection via import.meta.url
    - two-mode conditional PREFECT_ENTRY (global bin vs node + abs path)
    - blanket opencode_ -> prefect_ rename in all doc files
key_files:
  created: []
  modified:
    - src/cli.ts
    - CLAUDE.md
    - README.md
    - examples/test-task.md
decisions:
  - "Path-segment isGlobal check (__dirname.includes('/node_modules/prefect-mcp/')) is reliable across all version managers per RESEARCH.md; no --global flag needed"
  - "build/*.test.js in npm pack output is expected per RESEARCH.md Pitfall 5; files whitelist only excludes src/ not build/"
  - "PREFECT_SERVER_PASSWORD added to CLAUDE.md Environment section (was absent from original) to satisfy acceptance criteria requiring at least 1 match"
metrics:
  duration: "4m"
  completed_date: "2026-04-29"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 9 Plan 02: Documentation Rename + Global Install + npm Pack Verification Summary

**One-liner:** Global install detection wired into src/cli.ts via path-segment check; all doc files renamed to prefect_* tool names and PREFECT_* env vars; npm pack --dry-run confirmed shipping only build/ + README.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add global install detection + two-mode PREFECT_ENTRY in src/cli.ts | 93f45ab | src/cli.ts |
| 2 | Update CLAUDE.md and examples/test-task.md to prefect_* names + DIST-11 | 70db3a0 | CLAUDE.md, examples/test-task.md |
| 3 | Update README.md - rename + global install pathway + npm pack verify | 88b660f | README.md |

## Changes by File

### src/cli.ts (Task 1)

- Added `isGlobal` path-segment check: `__dirname.replace(/\\/g, '/').includes('/node_modules/prefect-mcp/')`
- Replaced single `PREFECT_ENTRY` const with conditional two-mode object:
  - Global: `{ command: 'prefect-mcp', args: [] }` — uses the `prefect-mcp` PATH bin
  - Local: `{ command: 'node', args: [resolve(__dirname, 'index.js')] }` — uses absolute path
- Removed `mcpServerPath` intermediate variable (inlined into local branch)
- Windows backslash normalization via `.replace(/\\/g, '/')` included

### CLAUDE.md (Task 2)

**Tool name renames (17 occurrences):**
- All `opencode_*` references in Canonical Loop, Tool Reference table, Permission Handling section replaced with `prefect_*`
- Verified: `grep -c "prefect_create_session" CLAUDE.md` = 2, `prefect_run` = 6, `prefect_delegate` = 1, `prefect_dispatch` = 1

**DIST-11 directory-arg instruction added to step 1:**
- New text: "Always pass `directory` explicitly - never rely on the server's default working directory. The same applies to `prefect_delegate` and `prefect_dispatch`"

**Environment section updated:**
- `OPENCODE_URL` -> `PREFECT_SERVER_URL` with deprecation note
- Added `PREFECT_SERVER_PASSWORD` / `PREFECT_SERVER_USERNAME` (were absent from original CLAUDE.md)

### examples/test-task.md (Task 2)

- `prefect_create_session`: 2 occurrences (was `opencode_create_session`)
- `prefect_run`: 3 occurrences (was `opencode_run`)
- `prefect_get_diff`: 3 occurrences (was `opencode_get_diff`)
- Zero `opencode_` references remain

### README.md (Task 3)

**Tool name renames:** prefect_create_session (2), prefect_run (4), prefect_get_diff (2), prefect_fork (1), prefect_revert (1), prefect_abort (2), prefect_approve_permission (1)

**Env var renames:**
- `OPENCODE_URL` -> `PREFECT_SERVER_URL` (7 occurrences)
- `OPENCODE_SERVER_PASSWORD` -> `PREFECT_SERVER_PASSWORD` (4 occurrences)
- `OPENCODE_SERVER_USERNAME` -> `PREFECT_SERVER_USERNAME` (1 occurrence)
- `OPENCODE_DEFAULT_PROJECT` -> `PREFECT_DEFAULT_PROJECT` (2 occurrences)

**Global install section added (DIST-06):** New "## Install" section before Prerequisites with:
- Option 1: `npm install -g prefect-mcp` + `prefect init` + global-mode `.mcp.json` snippet (`command: prefect-mcp`)
- Option 2: Local clone + `prefect init` + local-mode `.mcp.json` snippet (`command: node, args: [/abs/path/...]`)
- `--force` flag note

**Deprecation note added** to Configuration table: old `OPENCODE_*` names still work, emit stderr warning, removed in v4.0.

## Smoke Test Result

Local-mode detection (from dev checkout):

```
$ cd $(mktemp -d) && node /path/to/build/cli.js init
Created .mcp.json with prefect entry
{
  "mcpServers": {
    "prefect": {
      "type": "stdio",
      "command": "node",
      "args": ["/abs/path/to/build/index.js"],
      "env": {}
    }
  }
}
```

Result: PASS. Dev checkout correctly emits `command: node` (not in `node_modules/prefect-mcp/` path).

## npm pack --dry-run Output (DIST-04 Evidence)

```
npm notice
npm notice  prefect-mcp@1.0.0
npm notice Tarball Contents
npm notice 10.5kB README.md
npm notice 2.7kB  build/auth.js
npm notice 4.3kB  build/auth.test.js
npm notice 4.7kB  build/autostart.js
npm notice 5.9kB  build/autostart.test.js
npm notice 2.7kB  build/cli.js
npm notice 4.2kB  build/cli.test.js
npm notice 1.2kB  build/config.js
npm notice 2.5kB  build/diff-patch.test.js
npm notice 1.4kB  build/fetch.js
npm notice 2.5kB  build/handlers.js
npm notice 41.2kB build/index.js
npm notice 6.7kB  build/parts.js
npm notice 3.7kB  build/parts.test.js
npm notice 3.3kB  build/session-command.test.js
npm notice 891B   package.json
npm notice Tarball Details
npm notice name:          prefect-mcp
npm notice version:       1.0.0
npm notice filename:      prefect-mcp-1.0.0.tgz
npm notice package size:  22.4 kB
npm notice unpacked size: 98.5 kB
npm notice total files:   16
```

DIST-04 criteria verified:
- build/ files present: PASS
- README.md present: PASS
- src/ TypeScript absent: PASS
- node_modules/ absent: PASS
- .planning/ absent: PASS
- .git/ absent: PASS
- .mcp.json absent: PASS

Note: `build/*.test.js` files are present. This is expected per RESEARCH.md Pitfall 5 — the `files: ["build/", "README.md"]` whitelist ships all build/ output including compiled test files. Only src/ TypeScript is excluded.

## Test Results

`npm test` passes 39/39 after all changes. cli.ts modifications do not affect test suite.

## npm publish Readiness

The package is ready for `npm publish` as a manual step:

1. Verify npm registry login: `npm whoami`
2. Publish: `npm publish --access public`
3. Verify: `npm info prefect-mcp`
4. Install globally: `npm install -g prefect-mcp && prefect init`

The publish step is intentionally out of scope for this phase.

## Deviations from Plan

### Auto-added: PREFECT_SERVER_PASSWORD to CLAUDE.md

**Rule 2 - Missing critical functionality**

- **Found during:** Task 2 acceptance criteria check
- **Issue:** CLAUDE.md acceptance criteria required `grep -c "PREFECT_SERVER_PASSWORD" CLAUDE.md` >= 1, but the original CLAUDE.md had no HTTP auth documentation at all (only `OPENCODE_URL` was mentioned). After renaming, the section still lacked auth env var documentation.
- **Fix:** Added a new bullet to the Environment section: "HTTP Basic Auth: set `PREFECT_SERVER_PASSWORD` (and optionally `PREFECT_SERVER_USERNAME`) in your shell profile. Do NOT put in `.mcp.json`."
- **Files modified:** CLAUDE.md
- **Commit:** 70db3a0

## Known Stubs

None. All data is wired — isGlobal detection reads actual runtime paths, PREFECT_ENTRY writes real command values, documentation reflects actual package.json bin entries.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond those documented in the plan's threat model (T-09-06 through T-09-10 assessed and accepted).

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/cli.ts | FOUND |
| CLAUDE.md | FOUND |
| README.md | FOUND |
| examples/test-task.md | FOUND |
| 09-02-SUMMARY.md | FOUND |
| commit 93f45ab (Task 1) | FOUND |
| commit 70db3a0 (Task 2) | FOUND |
| commit 88b660f (Task 3) | FOUND |
