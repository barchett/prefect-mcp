---
phase: 10-run-session-param-additions
plan: "01"
subsystem: mcp-server
tags:
  - typescript
  - mcp
  - zod
  - opencode-sdk
  - additive
dependency_graph:
  requires: []
  provides:
    - RunPromptOptions.tools (RUN-05)
    - RunPromptOptions.files (RUN-06)
    - RunPromptOptions.messageID (RUN-07)
    - RunPromptOptions.agentInput (RUN-08)
    - RunPromptOptions.subtaskInput (RUN-08)
    - createSession.parentID (SESSION-10)
  affects:
    - src/handlers.ts
    - src/index.ts
tech_stack:
  added: []
  patterns:
    - conditional-spread for optional body fields
    - trailing-optional-param for backward-compatible API extension
    - z.record(z.string(), z.boolean()) for boolean-flag maps
key_files:
  created: []
  modified:
    - src/handlers.ts
    - src/index.ts
decisions:
  - "prefect_prompt_async extended for parity with prefect_run (RESEARCH.md Open Q1 — zero-risk additive symmetry, SessionPromptAsyncData.body is identical shape to SessionPromptData.body)"
  - "prefect_delegate and prefect_dispatch intentionally left unchanged (RESEARCH.md Open Q2 — composite extension is out of scope for Phase 10)"
  - "tools field uses z.record(z.string(), z.boolean()) — SDK type is { [key: string]: boolean }, NOT string[]; using z.array(z.string()) would be the documented anti-pattern"
  - "FilePartInput uses url field (not path) — matched exactly from @opencode-ai/sdk types.gen.d.ts"
  - "parentID added as 4th trailing optional param on createSession() — not 3rd — preserves existing 3-arg callers in prefect_delegate (line 591) and prefect_dispatch (line 637)"
metrics:
  duration: "169s"
  completed_date: "2026-04-29"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 10 Plan 01: Run + Session Param Additions Summary

Extended `prefect_run`, `prefect_prompt_async`, and `prefect_create_session` with additive SDK-parity fields: tools override (record), file attachments (FilePartInput), message resume, structured agent/subtask part inputs, and parent session ID.

## What Was Built

### Task 1 — src/handlers.ts (commit d03bb10)

Three additive edits to `src/handlers.ts`:

**Edit 1 — RunPromptOptions interface (lines 8-18):** Added five new optional fields:
- `tools?: { [key: string]: boolean }` — RUN-05, top-level body field
- `files?: Array<{ type: 'file'; mime: string; filename?: string; url: string }>` — RUN-06, parts array element
- `messageID?: string` — RUN-07, top-level body field
- `agentInput?: { type: 'agent'; name: string }` — RUN-08, parts array element
- `subtaskInput?: { type: 'subtask'; prompt: string; description: string; agent: string }` — RUN-08, parts array element

**Edit 2 — runPrompt() body construction (lines 56-79):** Replaced single-element `parts: [{ type: 'text', text: prompt }]` with a typed local `parts` array that appends `files`, `agentInput`, and `subtaskInput` after the text part. Added conditional spreads for `tools` and `messageID` at the top level of the request body (not in the parts array).

**Edit 3 — createSession() signature (lines 19-35):** Added `parentID?: string` as the 4th trailing optional parameter. Conditionally spreads `parentID` into the create body. Existing 3-arg callers (`prefect_delegate` line 591, `prefect_dispatch` line 637) are unaffected.

### Task 2 — src/index.ts (commit 37a2257)

Seven edits to `src/index.ts`:

**prefect_create_session (lines 34-47):**
- inputSchema: added `parentID: z.string().optional()` between `title` and `directory`
- handler: destructures `parentID`, passes it as 4th arg to `createSession(client, title, dir, parentID)`

**prefect_run (lines 87-139):**
- inputSchema: added five new Zod fields after `system` — `tools` (z.record), `files` (z.array of FilePartInput-shaped objects with url field), `messageID`, `agentInput`, `subtaskInput`
- handler destructuring: extended to include all five new fields
- runPrompt call: threaded all five into opts: `{ model, agent, system, tools, files, messageID, agentInput, subtaskInput }`

**prefect_prompt_async (lines 155-231):**
- inputSchema: same five Zod fields added for parity (SessionPromptAsyncData.body has identical shape)
- handler destructuring: extended to include all five new fields
- body construction: inline parts array now appends `files`, `agentInput`, `subtaskInput`; `tools` and `messageID` conditionally spread at top level

**Unchanged (verified):**
- `prefect_delegate` (line 622): still calls `runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal)` — untouched
- `prefect_dispatch` (line 666): still calls `createSession(client, title, dir)` — untouched

## Requirements Addressed

| Requirement | Field | Location | Status |
|-------------|-------|----------|--------|
| RUN-05 | `tools: { [key: string]: boolean }` | RunPromptOptions + prefect_run + prefect_prompt_async | Complete |
| RUN-06 | `files: FilePartInput[]` (url, not path) | RunPromptOptions + prefect_run + prefect_prompt_async | Complete |
| RUN-07 | `messageID: string` | RunPromptOptions + prefect_run + prefect_prompt_async | Complete |
| RUN-08 | `agentInput` + `subtaskInput` | RunPromptOptions + prefect_run + prefect_prompt_async | Complete |
| SESSION-10 | `parentID: string` on createSession | handlers.ts + prefect_create_session | Complete |

## Decisions Made

1. **prefect_prompt_async extended for parity** — RESEARCH.md Open Q1. `SessionPromptAsyncData.body` has identical shape to `SessionPromptData.body`. Included as zero-risk additive symmetry; keeps both tools in sync without requiring a follow-up phase.

2. **prefect_delegate and prefect_dispatch unchanged** — RESEARCH.md Open Q2. Composite extension is out of scope for Phase 10. Both still call `createSession(client, title, dir)` with three arguments.

3. **tools as z.record, not z.array** — The SDK type is `{ [key: string]: boolean }`. Using `z.array(z.string())` would be the documented anti-pattern and would cause TypeScript compile errors when passed to `client.session.prompt()`.

4. **FilePartInput uses `url` field** — Matched exactly from `@opencode-ai/sdk/dist/gen/types.gen.d.ts`. OpenCode accepts `file://` URIs for local files.

5. **parentID as 4th trailing optional** — Not 3rd. Adding it before `directory` would shift the position of existing 3-arg callers. Trailing optional is the safe extension pattern.

## Build Verification

```
npm run build
> tsc && chmod 755 build/index.js build/cli.js
Exit code: 0, zero TypeScript errors
```

## Threat Mitigations Applied

Per the plan's `<threat_model>`:
- T-10-01: `z.record(z.string(), z.boolean())` rejects non-boolean values and arrays at schema layer — applied
- T-10-02: `z.literal('file')` discriminator + required fields reject unknown shapes — applied
- T-10-08: `z.literal('agent')` and `z.literal('subtask')` discriminators — applied

Accepted threats T-10-03 through T-10-07 require no mitigation code per the plan.

## No New Threat Surface

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. All changes are additive fields on existing endpoints already present in the SDK.

## Deviations from Plan

None — plan executed exactly as written. All seven edits in Task 2 applied as specified. The `prefect_session_command` tool already contained a `...(messageID ? { messageID } : {})` spread (pre-existing, line 614), causing the grep check for "exactly one match" to return 2 — this is expected and does not indicate a deviation; the new match at line 228 is the `prefect_prompt_async` body as specified.

## Known Stubs

None.

## Self-Check: PASSED

- src/handlers.ts: FOUND
- src/index.ts: FOUND
- .planning/phases/10-run-session-param-additions/10-01-SUMMARY.md: FOUND
- Commit d03bb10 (Task 1): FOUND
- Commit 37a2257 (Task 2): FOUND
- npm run build: exit 0, zero TypeScript errors
