---
phase: 04-run-options-structured-responses-infrastructure
plan: "02"
subsystem: opencode-run
tags:
  - opencode-run
  - prompt-async
  - abort-controller
  - run-options
  - zod
dependency_graph:
  requires:
    - Plan 01 (src/parts.ts — PartSchema export)
  provides:
    - opencode_run v2.0 with AbortController, model/agent/system body fields, validated parts
    - opencode_prompt_async tool (fire-and-forget, RUN-04)
  affects:
    - Plan 03 (opencode_session_command uses same patterns)
    - All callers of opencode_run (return shape changed to { info, parts })
tech_stack:
  added:
    - AbortController (Node.js built-in) for timeout/cancellation
    - PartSchema.array().parse() for response parts validation
  patterns:
    - AbortController + clearTimeout in both success and catch paths (INFRA-01)
    - Conditional spread ...(field ? { field } : {}) for optional body fields
    - signal: controller.signal passed to SDK call for TCP cancellation
    - Structured return { info, parts } instead of raw JSON.stringify(data)
key_files:
  created: []
  modified:
    - src/index.ts
decisions:
  - "Promise.race pattern fully replaced by AbortController; old pattern preserved only as a comment explaining the motivation for the change"
  - "AbortError branch returns { isError: true } matching existing error convention (not re-throw)"
  - "data!.parts and data!.info use non-null assertion — safe because if(error)throw guard ensures data is defined before those lines"
  - "model field uses multi-line z.object().optional() format (chained) matching project style rather than inline format from plan code block"
metrics:
  duration: "2m 58s"
  completed_date: "2026-04-27"
  tasks_completed: 2
  files_created: 0
  files_modified: 1
---

# Phase 04 Plan 02: opencode_run v2.0 + opencode_prompt_async Summary

**One-liner:** opencode_run rewritten with AbortController timeout, optional model/agent/system body fields, and PartSchema-validated { info, parts } response; new opencode_prompt_async fire-and-forget tool added.

## What Was Built

### Task 1: opencode_run handler rewrite (src/index.ts)

**New Zod inputSchema:**
```typescript
z.object({
  sessionId: z.string(),
  prompt: z.string(),
  model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
  agent: z.string().optional(),
  system: z.string().optional(),
})
```

**AbortController timeout behavior:**
- `const controller = new AbortController()`
- `const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)`
- `signal: controller.signal` passed to `client.session.prompt()`
- `clearTimeout(timer)` fires on BOTH success and catch paths (no timer leak)
- On `AbortError`, returns the existing timeout message string with `isError: true`
- On other errors, passes through with `isError: true` (existing convention)

**Promise.race removal:** The old `new Promise<never>((_, reject) => setTimeout(...))` / `Promise.race([...])` pattern is fully removed from active code. It appears once in a comment explaining the old behavior.

**Return shape change (SURF-02):**
```typescript
// Before:
JSON.stringify(data)

// After:
JSON.stringify({ info: data!.info, parts: PartSchema.array().parse(data!.parts) })
```

**Import added:**
```typescript
import { PartSchema } from './parts.js';
```

### Task 2: opencode_prompt_async tool registration (src/index.ts)

**Signature:**
```typescript
server.registerTool('opencode_prompt_async', {
  inputSchema: z.object({
    sessionId: z.string(),
    prompt: z.string(),
    model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
    agent: z.string().optional(),
    system: z.string().optional(),
  })
}, async ({ sessionId, prompt, model, agent, system }) => { ... })
```

**Behavior:**
- Calls `client.session.promptAsync()` (POST /session/:id/prompt_async, 204 void)
- No AbortController — fire-and-forget, API returns immediately
- Returns `{ sessionId, accepted: true }` as JSON on success
- Returns `{ isError: true }` with error string on SDK error
- Positioned between opencode_run and opencode_get_diff in tool registration order

**Tool registration order (verified):**
1. opencode_create_session
2. opencode_abort
3. opencode_run (modified)
4. opencode_prompt_async (NEW)
5. opencode_get_diff
6. opencode_approve_permission
7. opencode_fork
8. opencode_revert
9. opencode_session_list ... (Phase 3 tools unchanged)

## Requirements Addressed

| Requirement | Status |
|-------------|--------|
| RUN-01: model override (providerID + modelID both required) | Done |
| RUN-02: agent override | Done |
| RUN-03: system prompt override | Done |
| RUN-04: opencode_prompt_async tool | Done |
| INFRA-01: AbortController replaces Promise.race | Done |
| SURF-02: PartSchema parts validation on opencode_run | Done |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c7d39a2 | feat(04-02): replace opencode_run with AbortController, body fields, parts validation |
| Task 2 | bff6062 | feat(04-02): register opencode_prompt_async tool (RUN-04) |

## Deviations from Plan

None — plan executed exactly as written.

The only minor note: `model: z.object({...}).optional()` is formatted across multiple lines (chained) rather than inline as shown in the plan's code block. This is consistent with the project style used in other tools in the file. The behavior and types are identical.

## Threat Surface Scan

No new network endpoints beyond what the plan describes. The two changes are:
- `opencode_run` now forwards model/agent/system to the existing `/session/:id/prompt` endpoint
- `opencode_prompt_async` adds forwarding to `/session/:id/prompt_async`

Threat T-04-04 (Tampering — model field) is mitigated: Zod schema requires BOTH `providerID` AND `modelID` together; partial model objects are rejected before SDK call.

Threat T-04-05 (DoS — orphaned requests) is mitigated: AbortController cancels in-flight TCP connection on timeout; clearTimeout fires in both success and catch paths.

## Known Stubs

None. Both tools are fully wired: opencode_run returns live validated parts from the SDK response; opencode_prompt_async calls the real SDK endpoint.

## Self-Check: PASSED

- src/index.ts modified: FOUND
- import { PartSchema } from './parts.js': FOUND (line 6)
- AbortController in opencode_run: FOUND (line 2 occurrences — new AbortController + comment reference)
- Promise.race in active code: NOT FOUND (1 occurrence in comment only — verified line 63)
- clearTimeout(timer): FOUND (2 occurrences — success path and catch path)
- PartSchema.array().parse: FOUND (1 occurrence)
- client.session.promptAsync: FOUND (1 occurrence)
- JSON.stringify({ sessionId, accepted: true }): FOUND (1 occurrence)
- opencode_prompt_async after opencode_run, before opencode_get_diff: VERIFIED (lines 137, 67, 180)
- npm run build: EXITS 0
- Commit c7d39a2 (Task 1): FOUND
- Commit bff6062 (Task 2): FOUND
