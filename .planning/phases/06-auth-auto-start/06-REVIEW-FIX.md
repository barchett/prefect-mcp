---
phase: 06-auth-auto-start
fixed_at: 2026-05-01T00:00:00Z
review_path: .planning/phases/06-auth-auto-start/06-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/06-auth-auto-start/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

All three warnings were already resolved by subsequent phase work. No new commits required.

## Fixed Issues

### WR-01: Circular import — autostart.ts imports resolveDirectory from index.ts

**Status:** Already resolved
**How:** `src/autostart.ts` now imports `resolveDirectory` from `./config.js`. `src/config.ts` was extracted as a standalone module, breaking the `index → fetch → autostart → index` cycle.

### WR-02: authFetch silently overwrites any existing Authorization header

**Status:** Already resolved
**How:** `src/auth.ts` now logs `console.error('[Prefect] authFetch: overwriting existing Authorization header with Basic Auth')` when an existing Authorization header is detected, and the inline comment was updated to be explicit about the intentional overwrite.

### WR-03: ESM cache-bust via query string is undocumented behavior

**Status:** Already resolved
**How:** `src/autostart.test.ts` now imports `_resetStartPromise` directly from `autostart.ts` and calls it in `beforeEach`. The `?v=` query-string trick was eliminated from the primary test flow (a comment at line 34–39 explains the one remaining use for the remote-guard isolation test).

---

_Fixed: 2026-05-01_
_Fixer: Claude (manual audit — all issues resolved by subsequent phases)_
_Iteration: 1_
