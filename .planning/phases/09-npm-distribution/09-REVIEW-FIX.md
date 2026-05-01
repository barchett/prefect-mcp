---
phase: 09-npm-distribution
fixed_at: 2026-05-01T00:00:00Z
review_path: .planning/phases/09-npm-distribution/09-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
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

---

_Fixed: 2026-05-01_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
