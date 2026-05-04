---
phase: 09-npm-distribution
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/09-npm-distribution/09-REVIEW.md
iteration: 2
fix_scope: critical_warning_info
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/09-npm-distribution/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: isGlobal detection breaks on pnpm global installs

**Files modified:** `src/cli.ts`
**Commit:** 1a5a927
**Applied fix:** Broadened the path check from `/node_modules/@lbarchett/prefect-mcp/` to `/node_modules/`. pnpm global installs use `.pnpm/prefect-mcp@x.y.z/node_modules/prefect-mcp/` which contains `/node_modules/` but not the scoped package segment.

### WR-02: Module-level warnedPassword/warnedUsername flags leak between tests

**Files modified:** `src/auth.ts`, `src/auth.test.ts`
**Commit:** 1a5a927
**Applied fix:** Added `_resetWarnFlags()` export to auth.ts. auth.test.ts now imports it and calls it in `beforeEach` to reset flag state between tests, preventing ordering dependencies.

### WR-03: isConnRefused uses locale-sensitive string matching only

**Files modified:** `src/fetch.ts`
**Commit:** 1a5a927
**Applied fix:** Added a structural `causeCode === 'ECONNREFUSED'` check as the primary condition before the string fallbacks. This is more robust against Node.js versions or environments where the error string format differs.

### WR-04: prefect_find_symbol filter does not narrow TypeScript type

**Files modified:** `src/index.ts`
**Commit:** 1a5a927
**Applied fix:** Added explicit type predicate `(sym): sym is NonNullable<typeof sym>` to the `.filter()` call. TypeScript now correctly infers the filtered array type as non-nullable.

## Info Fixes (iteration 2)

### IN-01: README tool count is stale

**Status:** Already resolved
**How:** README says "40 MCP tools" and `grep -c "server.registerTool" src/index.ts` returns 40. Counts match. No change needed.

### IN-02: engines field conflicts with README Node version

**Status:** Already resolved
**How:** `package.json` engines says `">=20"` and README says "Node.js >= 20". Already aligned. No change needed.

### IN-03: autostart.ts uses `?v=` ESM cache-bust

**Status:** Already resolved
**How:** No `?v=` query strings present in `src/autostart.ts`. Not applicable.

### IN-04: spawn may need .cmd suffix on Windows

**Status:** Fixed
**Commit:** 5d32126
**How:** Added `const cmd = process.platform === 'win32' ? 'opencode.cmd' : 'opencode'` in `src/autostart.ts` and used `cmd` instead of the hardcoded `'opencode'` string in the `spawn` call.

### IN-05: Commented-out old tool names in CLAUDE.md

**Status:** Already resolved
**How:** No `opencode_*` commented-out tool names exist in CLAUDE.md. Not applicable.

---

_Fixed: 2026-05-01 (iteration 1), 2026-05-03 (iteration 2)_
_Fixer: Claude (gsd-code-fixer / autonomous fix pass)_
_Iteration: 2_
