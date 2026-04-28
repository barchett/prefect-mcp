---
phase: 08-read-only-api-wrappers
fixed_at: "2026-04-28T21:00:00Z"
review_path: .planning/phases/08-read-only-api-wrappers/08-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-04-28T21:00:00Z
**Source review:** .planning/phases/08-read-only-api-wrappers/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01 + WR-02: URI percent-encoding not decoded / Non-`file://` URIs produce garbage paths

**Files modified:** `src/index.ts`
**Commit:** ea19925
**Applied fix:** Combined both URI-handling fixes into a single atomic change in the `opencode_find_symbol` handler. Added a `startsWith('file://')` guard that returns `null` for non-file URIs (filtering them out after the map), and added `decodeURIComponent()` around the path extraction so percent-encoded characters (e.g. `%20` for spaces) are properly decoded before being passed to `path.relative()`. Build verified clean (`npm run build` produced zero TypeScript errors).

---

_Fixed: 2026-04-28T21:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
