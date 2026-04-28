---
phase: 08-read-only-api-wrappers
plan: "01"
status: issues_found
depth: standard
files_reviewed: 1
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
reviewed_at: "2026-04-28T20:50:00Z"
---

# Code Review: Phase 08 — Read-only API Wrappers

**Files reviewed:** `src/index.ts`
**Depth:** standard
**Build status:** clean (zero TypeScript errors)

---

## Findings

### WR-01 — URI percent-encoding not decoded

**Severity:** warning
**File:** `src/index.ts` (opencode_find_symbol handler)

The `opencode_find_symbol` tool strips `file://` from symbol URIs via `.replace(/^file:\/\//, '')` but never calls `decodeURIComponent`. Workspace paths containing spaces or non-ASCII characters produce literal `%20` (or similar) in the returned `path` field.

**Fix:**
```typescript
const absolutePath = decodeURIComponent(sym.location.uri.replace(/^file:\/\//, ''));
```

---

### WR-02 — Non-`file://` URIs silently produce garbage paths

**Severity:** warning
**File:** `src/index.ts` (opencode_find_symbol handler)

If OpenCode returns symbols with non-`file://` URIs (e.g., `vscode-builtin://`, `jdt://`), the regex replace leaves the scheme intact and `path.relative()` receives a URI string as a filesystem path. Callers get no error signal.

**Fix:** Guard with `startsWith('file://')` and filter non-matching entries:
```typescript
if (!sym.location.uri.startsWith('file://')) return null;
const absolutePath = decodeURIComponent(sym.location.uri.replace(/^file:\/\//, ''));
// ...then filter nulls from mapped array
```

---

### IN-01 — Optional `description` field silently drops from JSON

**Severity:** info
**File:** `src/index.ts` (opencode_list_agents handler)

`JSON.stringify` drops `undefined` values. When `a.description` is absent the key vanishes from output. Tool description documents the field as optional. No change required unless explicit `null` is preferred for consistent schema shape.

---

## Summary

No critical issues. Two warnings in `opencode_find_symbol` around URI handling (percent-encoding + non-file schemes). Core field projection, `resolveDirectory()` integration, SDK call shapes, and threat model mitigations (T-08-01 through T-08-05) are correctly implemented.
