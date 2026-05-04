---
phase: 13-server-registry
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/13-server-registry/13-REVIEW.md
iteration: 2
fix_scope: critical_warning_info
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/13-server-registry/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `process.exit` called inside library functions

**Files modified:** `src/registry.ts`, `src/cli.ts`
**Commit:** 6d946a1
**Applied fix:** Removed `process.exit(1)` from `readRegistry` catch block and from `removeServer`'s not-found branch. Both now throw `Error` instead. `handleRemoveServer` in `cli.ts` was updated to wrap `removeServer(name)` in a try/catch that prints the error message to stderr and calls `process.exit(1)`.

### WR-02: TOCTOU race in `readRegistry`

**Files modified:** `src/registry.ts`
**Commit:** 6d946a1
**Applied fix:** Replaced the `existsSync(registryPath)` guard + separate `readFileSync` call with a single try/catch block. The catch branch inspects `(err as NodeJS.ErrnoException).code`: if `ENOENT`, returns `{ servers: [] }`; otherwise re-throws a descriptive error. Removed `existsSync` from the `node:fs` import since it is no longer referenced in the file.

### WR-03: No runtime validation of parsed registry JSON shape

**Files modified:** `src/registry.ts`
**Commit:** 6d946a1
**Applied fix:** After `JSON.parse`, added a shape guard: `if (!parsed || !Array.isArray(parsed.servers))` throws `Error: malformed registry at <path>: expected { servers: [...] }`. This guard runs inside the try block so it is caught and re-thrown as a descriptive error by the outer catch.

## Info Fixes (iteration 2)

### IN-01: Column overflow in listServers tabular output

**Status:** Fixed
**Commit:** e075116
**How:** Updated the `cell` helper in `src/registry.ts` `listServers` from single-char unicode ellipsis truncation (`s.slice(0, w-1) + '…'`) to the 3-char `...` formula (`s.slice(0, w-4) + '...'`), giving clearer visual truncation with more padding before the ellipsis.

### IN-02: Fragile global-install detection

**Status:** Already resolved
**How:** The path-segment check in `src/cli.ts` (`__dirname.replace(/\\/g, '/').includes('/node_modules/')`) is already robust — it handles npm and pnpm global installs, normalizes Windows backslashes, and uses the real resolved path. No change needed.

### IN-03: Missing break statements in switch (add-server, remove-server, list-servers)

**Status:** Fixed
**Commit:** 037ec44
**How:** Added `break` after each of the three cases. Handlers have return type `never` so TypeScript does not flag breaks as unreachable, but they prevent latent fall-through if handlers throw before `process.exit`.

---

_Fixed: 2026-05-01 (iteration 1), 2026-05-03 (iteration 2)_
_Fixer: Claude (gsd-code-fixer / autonomous fix pass)_
_Iteration: 2_
