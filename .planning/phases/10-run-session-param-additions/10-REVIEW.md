---
phase: 10-run-session-param-additions
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/handlers.ts
  - src/index.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 10 adds five new optional parameters to `prefect_run` and `prefect_prompt_async` (`tools`, `files`, `messageID`, `agentInput`, `subtaskInput`) and a `parentID` parameter to `prefect_create_session`. The `RunPromptOptions` interface in `handlers.ts` is extended and the `runPrompt` helper is updated to build a typed `parts` array from the new fields. The `prefect_delegate` and `prefect_dispatch` composite tools are **not** updated to accept the new parameters — that is likely intentional for now but creates a silent capability gap.

The changes are internally consistent. The main concerns are: a URL validation gap on the `files[].url` field that could allow non-`file://` schemes to reach the upstream API unexpectedly; a logic ordering issue in `prefect_await` that is pre-existing but now more visible given the new `messageID` resume semantics; and the `prefect_delegate` / `prefect_dispatch` parameter gap which could confuse callers.

---

## Warnings

### WR-01: `files[].url` accepts any string — no scheme validation

**File:** `src/index.ts:108-114` (prefect_run) and `src/index.ts:186-192` (prefect_prompt_async)

**Issue:** The Zod schema for `files` validates `url` only as `z.string()`. The description says "use `file://` URIs for local files," but nothing enforces it. An MCP caller can pass `http://`, `https://`, or `data:` URIs. Depending on how the upstream OpenCode API handles those, this may be harmless, but it may also allow a caller to instruct OpenCode to fetch arbitrary remote content (SSRF-adjacent) when the operator intended local-only access.

**Fix:** Add a URL refinement or use `z.string().url()` with an additional `.startsWith('file://')` check, or at minimum add explicit validation in the handler before forwarding:

```typescript
// In the Zod schema:
files: z.array(z.object({
  type: z.literal('file'),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string().refine(
    (u) => u.startsWith('file://'),
    { message: 'files[].url must be a file:// URI' }
  ),
})).optional()
```

If remote URLs are intentionally allowed in future, this refinement can be removed at that time.

---

### WR-02: `agentInput` and `agent` (string) can be set simultaneously with no conflict detection

**File:** `src/index.ts:119-124` / `src/handlers.ts:66-67`

**Issue:** `prefect_run` exposes both `agent` (a top-level string override, RUN-02) and `agentInput` (a structured `{ type: 'agent', name }` part, RUN-08). Both can be provided in the same call. The descriptions attempt to distinguish them ("Distinct from the top-level agent string override"), but there is no guard against a caller supplying both. If the upstream OpenCode API applies both, the resulting behavior is undefined and likely surprising.

**Fix:** Add a Zod refinement at the schema level or an early-return guard in the handler:

```typescript
// Zod refinement on the entire object:
.refine(
  (v) => !(v.agent && v.agentInput),
  { message: 'Provide either agent or agentInput, not both' }
)
```

Alternatively, document explicitly in the `agentInput` description which one wins.

---

### WR-03: `prefect_delegate` and `prefect_dispatch` silently ignore new Phase 10 parameters

**File:** `src/index.ts:636-676` (prefect_delegate), `src/index.ts:681-718` (prefect_dispatch)

**Issue:** `prefect_delegate` and `prefect_dispatch` are composite tools that internally call `runPrompt` and `promptAsync` respectively. Neither exposes `tools`, `files`, `messageID`, `agentInput`, or `subtaskInput` to callers. This means callers who upgrade to Phase 10 and want to use these features must bypass the composite tools and manually call `prefect_create_session` + `prefect_run` themselves. This is not a crash, but it creates a silent capability gap — the composite tools become strictly less capable than the primitives with no indication in their descriptions.

**Fix:** Either:
1. Add the new parameters to `prefect_delegate` and `prefect_dispatch` input schemas (pass-through to `runPrompt`/`promptAsync`), OR
2. Update the tool descriptions to explicitly note "does not support tools/files/messageID/agentInput/subtaskInput overrides — use prefect_create_session + prefect_run directly for those features."

Option 2 is lower risk if the composite tools are deliberately kept minimal.

---

## Info

### IN-01: `import { createPatch } from 'diff'` is duplicated across both files

**File:** `src/index.ts:6`, `src/handlers.ts:2`

**Issue:** `createPatch` is imported in both `src/index.ts` (used in `prefect_await`, line 810) and `src/handlers.ts` (used in `getDiff`, line 110). The `getDiff` helper in `handlers.ts` correctly centralizes diff logic, but `src/index.ts` still uses `createPatch` directly in `prefect_await` rather than routing through `getDiff`. This means the patch generation logic (and any future changes to it) lives in two places.

**Fix:** In `prefect_await`, replace the inline `createPatch` call with the `getDiff` helper already imported at line 11, and remove the `createPatch` import from `src/index.ts`:

```typescript
// Replace lines 797-811 in src/index.ts:
const [messagesResult, diff] = await Promise.all([
  client.session.messages({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
  getDiff(client, sessionId, undefined, dir),
]);
// diff already includes patch strings — no manual createPatch needed
```

---

### IN-02: `RunPromptOptions.tools` type uses index signature instead of `Record<string, boolean>`

**File:** `src/handlers.ts:13`

**Issue:** `tools` is typed as `{ [key: string]: boolean }` while the Zod schema in `src/index.ts:105` uses `z.record(z.string(), z.boolean())`. These are semantically equivalent, but using `Record<string, boolean>` in the interface would be consistent with the rest of the codebase convention.

**Fix:**

```typescript
tools?: Record<string, boolean>;   // RUN-05
```

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
