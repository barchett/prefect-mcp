---
phase: 04-run-options-structured-responses-infrastructure
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/parts.ts
  - src/parts.test.ts
  - src/index.ts
  - src/cli.ts
  - src/cli.test.ts
  - src/diff-patch.test.ts
  - src/session-command.test.ts
  - package.json
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-04-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase adds five capabilities: (1) run-option overrides (model/agent/system) for `opencode_run`, (2) a fire-and-forget `opencode_prompt_async` tool, (3) unified diff/patch output from `opencode_get_diff`, (4) a `opencode_session_command` tool for slash commands, and (5) a CLI installer (`prefect init`). A new `src/parts.ts` module defines Zod schemas for all 12 OpenCode Part types, validated in `opencode_run`.

The implementation is generally clean. The AbortController upgrade to `opencode_run` is a genuine correctness improvement over the old `Promise.race`. The three warnings below are real bugs or edge cases that could cause failures or user confusion in production — none are style nits.

## Warnings

### WR-01: `PartSchema.array().parse(data!.parts)` throws on unexpected part types, crashing the tool call

**File:** `src/index.ts:106`
**Issue:** `PartSchema.array().parse(...)` uses `.parse()` (strict), which throws a `ZodError` if the OpenCode server emits a part type not yet in the schema (e.g. a future type added upstream). The catch block does not discriminate `ZodError` from `AbortError`, so it falls through to the generic `String(err)` branch with `isError: true`. The caller (Claude Code) receives a non-specific error and cannot distinguish a schema mismatch from a network failure. Additionally, the non-null assertion `data!.parts` at line 106 (and `data!.info` at line 111) could throw if `data` is `null` — the `if (error) throw` guard above only protects against the `error` field being set; the SDK can return `{ data: null, error: null }` in edge cases.

**Fix:**
```typescript
// 1. Use safeParse so unexpected part types degrade gracefully rather than crashing.
const parseResult = PartSchema.array().safeParse(data!.parts);
const validatedParts = parseResult.success
  ? parseResult.data
  : data!.parts; // pass through raw parts if schema doesn't match; log the issue

if (!parseResult.success) {
  // Log to stderr (not stdout — that corrupts the JSON-RPC stream)
  console.error('PartSchema validation warning:', parseResult.error.message);
}

// 2. Guard data before dereferencing.
if (!data) throw new Error('Session prompt returned no data');
```

---

### WR-02: `opencode_session_command` returns raw `data` without PartSchema validation, inconsistent with `opencode_run`

**File:** `src/index.ts:541`
**Issue:** `opencode_run` now validates response parts against `PartSchema` (SURF-02). `opencode_session_command` (CMD-01) also returns `{ info, parts }` per its description and the comment at line 510–512, but calls `JSON.stringify(data)` directly without schema validation. If a caller relies on the parts being in the same validated shape as those returned by `opencode_run`, they will get inconsistent results. This is also a latent bug: if the command endpoint returns a type that fails schema validation, `opencode_run` will surface it as an error while `opencode_session_command` silently passes it through.

**Fix:**
```typescript
if (error) throw new Error(JSON.stringify(error));
if (!data) throw new Error('Session command returned no data');
// Apply same PartSchema validation as opencode_run for consistency
const parseResult = PartSchema.array().safeParse((data as { parts?: unknown }).parts);
const parts = parseResult.success ? parseResult.data : (data as { parts?: unknown }).parts;
return {
  content: [{ type: 'text', text: JSON.stringify({ info: (data as { info?: unknown }).info, parts }) }],
};
```

---

### WR-03: `parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10)` silently produces `NaN` on malformed input

**File:** `src/index.ts:11`
**Issue:** `parseInt('abc', 10)` returns `NaN`. `setTimeout(() => controller.abort(), NaN)` fires immediately in Node.js (NaN is treated as 0). A user who sets `PREFECT_TIMEOUT_MS=` (empty string) or a typo like `PREFECT_TIMEOUT_MS=120s` will experience every `opencode_run` call instantly aborting with a timeout error, with no diagnostic indicating the env var is the cause.

**Fix:**
```typescript
const rawTimeout = process.env.PREFECT_TIMEOUT_MS;
const parsed = rawTimeout ? parseInt(rawTimeout, 10) : NaN;
const TIMEOUT_MS = Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
if (rawTimeout && !Number.isFinite(parsed)) {
  console.error(`Warning: PREFECT_TIMEOUT_MS="${rawTimeout}" is not a valid integer; using default 120000ms`);
}
```

---

## Info

### IN-01: `test` script in `package.json` omits the new test files

**File:** `package.json:7`
**Issue:** The `test` script runs `node --test build/parts.test.js build/cli.test.js`. The two new test files `build/diff-patch.test.js` and `build/session-command.test.js` are not included. They will be silently skipped when running `npm test`.

**Fix:**
```json
"test": "tsc && node --test build/parts.test.js build/cli.test.js build/diff-patch.test.js build/session-command.test.js"
```
Or use a glob to avoid maintaining the list manually:
```json
"test": "tsc && node --test 'build/*.test.js'"
```

---

### IN-02: Imported but unused named exports from `src/parts.ts` in tests

**File:** `src/parts.test.ts:6-11`
**Issue:** `TextPartSchema`, `FilePartSchema`, `ToolPartSchema`, `StepFinishPartSchema`, and `RetryPartSchema` are imported but none are referenced directly in any test body. The tests exercise these schemas exclusively through `PartSchema`. The unused imports add noise and will produce TypeScript unused-variable warnings if `noUnusedLocals` is enabled.

**Fix:** Remove the unused named imports:
```typescript
import {
  PartSchema,
  ToolStateSchema,
  ApiErrorSchema,
} from './parts.js';
```

---

### IN-03: `z.lazy(() => FilePartSchema)` in `ToolStateCompletedSchema.attachments` is unnecessary

**File:** `src/parts.ts:81`
**Issue:** `z.lazy()` is used for forward references to schemas defined later in the file. `FilePartSchema` is defined *above* `ToolStateCompletedSchema` (lines 59–68 vs. line 70). The lazy reference was needed during development while the schemas were in a different order, but is now a no-op. It adds a small runtime cost and slightly obscures the type inference for `attachments`.

**Fix:**
```typescript
attachments: z.array(FilePartSchema).optional(),
```

---

_Reviewed: 2026-04-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
