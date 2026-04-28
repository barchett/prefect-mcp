---
phase: 06-auth-auto-start
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/auth.ts
  - src/auth.test.ts
  - src/autostart.ts
  - src/autostart.test.ts
  - src/fetch.ts
  - src/index.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 6 implements HTTP Basic Auth injection (`src/auth.ts`), auto-start of `opencode serve` on ECONNREFUSED (`src/autostart.ts`), and a combined `fetchWithAuth` wrapper (`src/fetch.ts`) that threads both behaviors uniformly through the OpenCode SDK client. The core logic is sound and the design decisions (call-time env reads, Promise lock for deduplication, clone-before-retry) are correct. Three issues warrant attention before shipping:

1. A circular import between `autostart.ts` and `index.ts` creates a structural fragility that is currently safe but could silently break under future refactoring.
2. `authFetch` silently overwrites any pre-existing `Authorization` header in the incoming request — a semantic mismatch with the comment.
3. The ESM cache-bust technique used in `autostart.test.ts` is undocumented Node.js behavior and may not work reliably across versions.

---

## Warnings

### WR-01: Circular import — `autostart.ts` imports `resolveDirectory` from `index.ts`

**File:** `src/autostart.ts:3`
**Issue:** `autostart.ts` imports `resolveDirectory` from `./index.js`. `index.ts` imports `fetch.ts` which imports `autostart.ts`, forming a cycle: `index → fetch → autostart → index`. In Node.js ESM, circular imports are permitted but the imported binding is `undefined` if accessed during module initialization of the depended-upon module. Currently `resolveDirectory` is only called inside the body of `ensureOpencodeRunning()` (never at module init), so the cycle resolves correctly at runtime. However, the dependency is fragile: any future move of a call to module-init scope (e.g., computing a default) would silently receive `undefined` with no error.

**Fix:** Break the cycle by extracting `resolveDirectory` into its own module (e.g., `src/config.ts`) and importing from there in both `index.ts` and `autostart.ts`.

```typescript
// src/config.ts (new file)
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}

// src/autostart.ts — change import to:
import { resolveDirectory } from './config.js';

// src/index.ts — change import to:
import { resolveDirectory } from './config.js';
```

---

### WR-02: `authFetch` silently overwrites any existing `Authorization` header

**File:** `src/auth.ts:33`
**Issue:** The spread `{ ...Object.fromEntries(request.headers), ...headers }` always overwrites any existing `Authorization` header in the incoming request with the Basic Auth credential. The inline comment says "existing headers win on conflict, except Authorization which we always set" — this documents the intent — but if the OpenCode SDK ever adds its own `Authorization` header (e.g., a bearer token for a future feature), that header would be silently dropped and replaced with the Basic Auth header, potentially breaking authentication without any error.

**Fix:** Either assert that no existing `Authorization` header is present, or log a warning when one is overwritten. At minimum, reverse the comment to be explicit about the takeover behavior:

```typescript
// Auth header always wins — we intentionally overwrite any pre-existing
// Authorization header from the SDK, since Basic Auth is the only auth
// mechanism supported by this server.
const merged = { ...Object.fromEntries(request.headers), ...headers };
```

If future-proofing is desired, add a defensive log:
```typescript
if (request.headers.get('Authorization')) {
  console.error('[Prefect] authFetch: overwriting existing Authorization header with Basic Auth');
}
const merged = { ...Object.fromEntries(request.headers), ...headers };
```

---

### WR-03: ESM cache-bust via query string (`?v=...`) is undocumented behavior

**File:** `src/autostart.test.ts:41,69,100`
**Issue:** The tests use `await import('./autostart.js?v=dedup-test' as string)` to obtain isolated module instances with fresh `startPromise = null` state. In Node.js native ESM, the module registry is keyed by the resolved specifier URL. Adding `?v=...` to a file path produces a distinct URL key, which does currently cause Node.js to load the module again. However, this behavior is undocumented and classified as an implementation detail — it may not work in all module loaders (tsx, Bun, Deno), and may break in a future Node.js version. If the trick stops working, all three "first-call" tests will silently share state and produce unreliable results, with no test failure to indicate the isolation is broken.

**Fix:** The safest approach is to expose a `_resetForTest()` function from `autostart.ts` (guarded by `process.env.NODE_ENV === 'test'` or a `/* @internal */` JSDoc annotation) that resets `startPromise` to `null` between tests:

```typescript
// src/autostart.ts — add at the bottom
/** @internal — test use only */
export function _resetStartPromise(): void {
  startPromise = null;
}

// src/autostart.test.ts — replace dynamic import with:
import { ensureOpencodeRunning, _resetStartPromise } from './autostart.js';

// Before each test that needs a fresh state:
_resetStartPromise();
```

---

## Info

### IN-01: Weak deduplication assertion in test

**File:** `src/autostart.test.ts:53`
**Issue:** `assert.ok(fetchCallCount >= 1, 'health poll should have been called at least once')` does not verify that concurrent calls were actually deduplicated. The test fires two concurrent calls and then checks `fetchCallCount >= 1`, which passes even if both calls each triggered their own health poll (i.e., `fetchCallCount === 2`).

**Fix:** Assert an upper bound:
```typescript
assert.ok(fetchCallCount >= 1, 'health poll should have been called at least once');
assert.ok(fetchCallCount <= 1, `dedup failed — health poll called ${fetchCallCount} times for 2 concurrent calls`);
```
Or more directly: `assert.equal(fetchCallCount, 1, 'exactly one health poll for two concurrent calls')`.

---

### IN-02: `resolveDirectory` body is redundant — `?? undefined` is a no-op

**File:** `src/index.ts:24`
**Issue:** `return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;` — the trailing `?? undefined` is always a no-op because `process.env.OPENCODE_DEFAULT_PROJECT` is already `string | undefined`; if it is `undefined`, the expression already evaluates to `undefined` without the final clause. This is harmless but slightly noisy.

**Fix:**
```typescript
return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT;
```

---

_Reviewed: 2026-04-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
