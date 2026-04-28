# Phase 7: Composite Tools - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add four composite MCP tools (`opencode_delegate`, `opencode_dispatch`, `opencode_inspect`, `opencode_await`) plus a handler-extraction refactor that moves shared SDK call logic out of inline tool handlers into named functions. Composites call these named functions — no HTTP call duplication.

Requirements in scope: WORKFLOW-01, WORKFLOW-02, WORKFLOW-03, WORKFLOW-04, WORKFLOW-05, WORKFLOW-06, WORKFLOW-07

</domain>

<decisions>
## Implementation Decisions

### Handler Extraction (WORKFLOW-07)

- **D-01:** Shared handler functions live in a new `src/handlers.ts` module. `src/index.ts` is already 600 lines with three extracted-module precedents (`parts.ts`, `auth.ts`, `autostart.ts`). Inline helpers in `src/index.ts` would break the established pattern.
- **D-02:** Named functions in `src/handlers.ts` must include at minimum: `createSession`, `runPrompt`, `getDiff` — the three operations that `opencode_delegate` chains. Other handlers may also be extracted as needed for the composites.
- **D-03:** Existing tool registrations in `src/index.ts` are updated to call the extracted handlers rather than duplicating SDK calls inline. The 18 existing tools must behave identically after the refactor (Success Criterion 6).

### opencode_delegate (WORKFLOW-01, WORKFLOW-02)

- **D-04:** Returns `{ sessionId, result, diff }` where `result` is the structured `{ info, parts }` payload (same shape as `opencode_run`) and `diff` is the `Array<FileDiff & { patch: string }>` returned by `getDiff` (same shape as `opencode_get_diff`).
- **D-05:** Timeout: if the run exceeds `PREFECT_TIMEOUT_MS`, abort the session and return an error. No separate timeout param — uses the same env var as `opencode_run` for consistency.
- **D-06:** Session lifecycle: **keep alive after completion**. Auto-delete is irreversible and removes the ability to inspect, fork, or recover from a bad result. The caller can explicitly call `opencode_session_delete` if cleanup is desired. Never make irreversible decisions automatically.

### opencode_dispatch (WORKFLOW-03)

- **D-07:** Returns `{ sessionId }` immediately — non-blocking fire-and-forget. Creates the session, fires `prompt_async`, and returns without waiting for the agent.
- **D-08:** Same model/agent/system override fields as `opencode_run` — delegate and dispatch have identical input shapes except dispatch is non-blocking.

### opencode_inspect (WORKFLOW-04)

- **D-09:** Returns `{ status, todos, changedFiles }`. Sources:
  - `status`: from `session.status()` — the SessionStatus for this session (`"idle" | "busy" | "retry"`)
  - `todos`: from `session.todo()` — `Array<Todo>` (content, status, priority fields)
  - `changedFiles`: from `session.diff()` — mapped to `{ file, additions, deletions }[]`, **no patch content**
- **D-10:** `changedFiles` format rationale: opencode_inspect answers "how much has changed?" not "what exactly changed?" Full FileDiff with patch content is what `opencode_get_diff` is for. Keep inspect compact.

### opencode_await (WORKFLOW-05, WORKFLOW-06)

- **D-11:** Polls `session.status()` until the session's status is `"idle"`, then fetches `session.messages()` and `session.diff()` to reconstruct the result.
- **D-12:** Result reconstruction: filter `session.messages()` for the last item with `info.role === "assistant"` → take its `{ info, parts }`. This gives the same shape as `opencode_run` output. Consistency matters over elegance.
- **D-13:** Returns `{ result: { info, parts }, diff }` on success — same shape as `opencode_delegate` for easy substitution between blocking and polling patterns.
- **D-14:** Poll interval: `pollIntervalMs` param, default `2000`. Timeout: `timeoutMs` param, default `PREFECT_TIMEOUT_MS`. Both configurable per WORKFLOW-06.
- **D-15:** On timeout: surface an error with the sessionId so the caller can inspect or abort manually.

### Code Organization

- **D-16:** Composite tool implementations go in `src/index.ts` alongside existing tool registrations (consistent with current pattern — only the shared handler *functions* move to `src/handlers.ts`).
- **D-17:** `src/handlers.ts` exports named async functions that encapsulate SDK calls + error handling. They do not register MCP tools — tool registration stays in `src/index.ts`.

### Claude's Discretion

- Exact function signatures for extracted handlers (whether they accept raw SDK params or a typed object) — planner decides the cleanest interface.
- Whether to validate parts in `opencode_await`'s reconstructed result with `PartSchema` (same as `opencode_run`) — planner should apply for consistency, but Claude can decide.
- Error handling shape for `opencode_await` timeout — planner decides whether to include `sessionId` in the error payload.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SDK Types (authoritative — verify all field names here)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `SessionMessagesResponses` (shape of messages endpoint: `Array<{ info: Message, parts: Array<Part> }>`), `SessionTodoData` + `SessionTodoResponses` (todo endpoint), `SessionStatus` union (`{type:"idle"} | {type:"busy"} | {type:"retry",...}`), `Todo` type fields
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `session.todo()`, `session.status()`, `session.messages()` signatures

### Requirements
- `.planning/REQUIREMENTS.md` — WORKFLOW-01 through WORKFLOW-07. All 7 requirements are in scope for Phase 7.

### Existing Implementation
- `src/index.ts` — All 18 existing tool handlers (source for extraction refactor); `opencode_run` handler (template for `runPrompt` extracted function — AbortController pattern, PartSchema validation); `opencode_get_diff` handler (template for `getDiff` extracted function — patch computation)
- `src/handlers.ts` — New file to create; does not exist yet
- `src/parts.ts` — `PartSchema` for validating `parts` in reconstructed results
- `src/config.ts` — `resolveDirectory()` — used in all handler functions
- `src/fetch.ts` — `fetchWithAuth` — already wired into `createOpencodeClient`; handlers inherit auth transparently

### Prior Phase Decisions
- `.planning/phases/06-auth-auto-start/06-CONTEXT.md` — D-06: auto-start triggers once per process lifetime via `fetchWithAuth`; handler functions don't need to call `ensureOpencodeRunning()` directly — it's transparent
- `.planning/phases/04-run-options-structured-responses-infrastructure/04-CONTEXT.md` — D-06/D-07: all 12 Part types in PartSchema; D-09: model override requires both providerID and modelID
- `.planning/PROJECT.md` — Key Decisions table; Constraints section

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `opencode_run` handler in `src/index.ts` — the AbortController + `client.session.prompt()` pattern becomes `runPrompt()` in `src/handlers.ts`. Includes PartSchema validation, timeout handling, and error wrapping.
- `opencode_get_diff` handler in `src/index.ts` — the `client.session.diff()` + `createPatch()` mapping becomes `getDiff()` in `src/handlers.ts`.
- `opencode_create_session` handler in `src/index.ts` — the `client.session.create()` call becomes `createSession()` in `src/handlers.ts`.
- `resolveDirectory()` from `src/config.ts` — used in every extracted handler function.
- `PartSchema` from `src/parts.ts` — used in `runPrompt()` and in `opencode_await`'s result reconstruction.

### Established Patterns
- `const { data, error } = await client.session.method(...)` — SDK call pattern; all handlers follow this
- `if (error) throw new Error(JSON.stringify(error))` — error propagation pattern
- `console.error` only — stdout is the JSON-RPC pipe
- Module extraction: `src/auth.ts`, `src/autostart.ts`, `src/parts.ts` — each a focused concern with named exports

### Integration Points
- `createOpencodeClient` in `src/index.ts` — the `client` instance must be accessible to `src/handlers.ts`. Either export it from `src/index.ts` or pass it as a parameter to each handler function. Planner decides (passing as param is cleaner for testing).
- `TIMEOUT_MS` constant in `src/index.ts` — handlers that need the timeout (runPrompt) need access to this value.
- `opencode_await` poll loop: `session.status()` returns `{ [sessionId]: SessionStatus }` — extract the entry for the specific sessionId to get its status type.

</code_context>

<specifics>
## Specific Ideas

- `opencode_await` result reconstruction: `const msgs = await client.session.messages({ path: { id: sessionId } }); const last = [...msgs.data].reverse().find(m => m.info.role === 'assistant');` → `{ info: last.info, parts: PartSchema.array().parse(last.parts) }`
- `opencode_inspect changedFiles` mapping: `(data ?? []).map(d => ({ file: d.file, additions: d.additions, deletions: d.deletions }))` — drop `before`, `after`, and computed `patch`
- `session.status()` key access: `const statusMap = data as Record<string, { type: string }>; const status = statusMap[sessionId]?.type ?? 'unknown'` — the response is a map keyed by sessionId
- For `opencode_delegate`: call `createSession()` → `runPrompt()` → `getDiff()` in sequence; on AbortError from runPrompt, call `client.session.abort()` before returning the error

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-composite-tools*
*Context gathered: 2026-04-28*
