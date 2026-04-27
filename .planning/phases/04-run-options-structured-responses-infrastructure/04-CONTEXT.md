# Phase 4: Run Options + Structured Responses + Infrastructure - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand `opencode_run` with per-call overrides (model, agent, system prompt), add a true async fire-and-forget tool (`opencode_prompt_async`), surface structured response data from `opencode_run` and `opencode_get_diff` (no more raw JSON blobs), harden the timeout mechanism to cancel in-flight TCP connections, ship a `prefect init` CLI, and add `opencode_session_command` for running slash commands inside a session.

Requirements in scope: RUN-01, RUN-02, RUN-03, RUN-04, SURF-01, SURF-02, INFRA-01, INFRA-02, CMD-01

</domain>

<decisions>
## Implementation Decisions

### SURF-01: Patch string in opencode_get_diff

- **D-01:** The diff endpoint (`GET /session/:id/diff`) returns `Array<FileDiff>` where `FileDiff = { file, before, after, additions, deletions }`. There is **no** `patch` string in the API response.
- **D-02:** Add the **`diff` npm package** (`+ @types/diff` for types) as a new runtime dependency. Use `createPatch(filename, before, after)` to compute a unified diff string for each `FileDiff` entry.
- **D-03:** The response shape becomes: each element gains a top-level `patch: string` field alongside the existing fields. No fields are removed.
- **D-04:** Rationale: edge cases in unified diff output (no newline at end of file, binary files, empty files) are exactly what a well-maintained library handles correctly and what hand-rolled code gets wrong. `diff` is pure JS, no native bindings, no sub-dependencies — zero-risk dependency.

### SURF-02: Parts typed array in opencode_run

- **D-05:** `opencode_run` currently returns raw `JSON.stringify(data)`. The response must be restructured to return a typed `parts` array.
- **D-06:** **All 12 Part types** get full Zod schemas — no curated subset, no raw passthrough. The 12 discriminated types (by `type` literal string) confirmed from `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`:
  - `"text"` — TextPart: `{ id, sessionID, messageID, type, text }`
  - `"reasoning"` — ReasoningPart: `{ id, sessionID, messageID, type, text }`
  - `"file"` — FilePart: `{ id, sessionID, messageID, type, mime, source? }`
  - `"tool"` — ToolPart: `{ id, sessionID, messageID, type, callID, state: ToolStatePending | ToolStateCompleted | ToolStateError }`
  - `"step-start"` — StepStartPart: `{ id, sessionID, messageID, type, snapshot? }`
  - `"step-finish"` — StepFinishPart: `{ id, sessionID, messageID, type, reason }`
  - `"snapshot"` — SnapshotPart: `{ id, sessionID, messageID, type, snapshot }`
  - `"patch"` — PatchPart: `{ id, sessionID, messageID, type, hash, files: string[] }`
  - `"agent"` — AgentPart: `{ id, sessionID, messageID, type, name, source? }`
  - `"retry"` — RetryPart: `{ id, sessionID, messageID, type, attempt, ... }`
  - `"compaction"` — CompactionPart: `{ id, sessionID, messageID, type, auto }`
  - `"subtask"` — SubtaskPart: `{ id, sessionID, messageID, type, prompt, ... }`
- **D-07:** The planner MUST verify exact field names for `ToolStatePending | ToolStateCompleted | ToolStateError` and `RetryPart` / `SubtaskPart` from the SDK types before writing Zod schemas — the `ToolPart.state` discriminant in particular. Getting discriminator strings wrong is the same class of bug as the `once`/`always`/`reject` permission enum in v1.

### RUN-01 / RUN-02 / RUN-03: opencode_run body field additions

- **D-08:** These three requirements add optional fields to `opencode_run`'s Zod input schema and pass them through to `client.session.prompt({ body: { ... } })`. The SDK types already support all three: `model?: { providerID: string; modelID: string }`, `agent?: string`, `system?: string`.
- **D-09:** For `model` override (RUN-01): **both `providerID` and `modelID` are required together**. Reject at Zod schema level if only one is provided — use `z.object({ providerID: z.string(), modelID: z.string() }).optional()`.
- **D-10:** INFRA-01 (AbortController) must be implemented in the **same atomic change** as RUN-04 (`opencode_prompt_async`) since both touch the timeout/async path in `opencode_run`. RUN-01/02/03 should also be in the same commit since all four modify the same handler block.

### INFRA-01: AbortController timeout fix

- **D-11:** Replace `Promise.race` with `AbortController` + `fetch signal`. The SDK `Config` type extends `Omit<RequestInit, "body" | "headers" | "method">` which preserves `signal?: AbortSignal` — so passing `controller.signal` directly to the SDK call is possible without bypassing the SDK.
- **D-12:** On timeout, call `controller.abort()` — this cancels the in-flight TCP connection rather than orphaning it.

### RUN-04: opencode_prompt_async

- **D-13:** New tool `opencode_prompt_async`. Sends a prompt to `POST /session/:id/prompt_async` and returns immediately (204 void from the API).
- **D-14:** Return value: `{ sessionId: string, accepted: true }` — structured so callers have the session ID without parsing strings, enabling immediate follow-up calls to `opencode_session_status` or `opencode_session_messages`.
- **D-15:** The body shape of `SessionPromptAsyncData` is identical to `SessionPromptData` (same optional fields: `model`, `agent`, `system`, `tools`, `parts`). Apply the same Zod schema as the updated `opencode_run` for consistency.

### INFRA-02: prefect init CLI

- **D-16:** Entry point: `src/cli.ts` compiles to `build/cli.js`. The `package.json` `bin` field currently maps `"prefect"` to `./build/index.js` — this must be updated to point to `build/cli.js`.
- **D-17:** Merge-not-overwrite behavior:
  1. No `.mcp.json` → create it with the `prefect` entry
  2. `.mcp.json` exists, no `prefect` key in `mcpServers` → add the `prefect` entry, preserve all other keys
  3. `.mcp.json` exists, `prefect` key already in `mcpServers` → exit 1, tell user to use `--force`
  4. `prefect init --force` → overwrite **only** the `prefect` key in `mcpServers`; all other keys in `.mcp.json` are preserved
- **D-18:** The `.mcp.json` template uses the absolute path to `build/index.js` (resolved at runtime from the CLI's own location). No prompts for URL — the `OPENCODE_URL` env var already handles port overrides.

### CMD-01: opencode_session_command

- **D-19:** New tool `opencode_session_command`. Calls `POST /session/:id/command`. Body fields from SDK: `command: string` (the slash command name), `arguments: string` (arguments string), plus optional `messageID?`, `agent?`, `model?: string` (note: plain string, NOT `{ providerID, modelID }` — different from RUN-01).
- **D-20:** Response: `{ info: AssistantMessage, parts: Array<Part> }` — same Part union as SURF-02. Return as JSON.

### Claude's Discretion

- The exact `bin` field update in `package.json` (whether to keep `"prefect"` pointing to the MCP server or create a separate key) — planner should handle.
- How to structure the `src/cli.ts` argument parsing (Commander.js vs manual `process.argv` — given the minimal surface, manual is likely fine but planner decides).
- Whether to add a `tsconfig` `paths` or `outFile` change for the CLI compilation — planner handles.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SDK Types (authoritative source for all field names and discriminators)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — Full Part union, SessionPromptData, SessionPromptAsyncData, SessionCommandData, SessionDiffResponse, FileDiff. **MUST read before writing any Zod schemas for SURF-02.**
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — SDK method signatures and Options type

### Requirements
- `.planning/REQUIREMENTS.md` — RUN-01 through RUN-04, SURF-01, SURF-02, INFRA-01, INFRA-02. Planner note on SURF-02 discriminators is especially important.

### Existing Implementation
- `src/index.ts` — Current `opencode_run` handler (lines ~60-90) is the target for INFRA-01 + RUN-01/02/03 + RUN-04 changes; `opencode_get_diff` handler is the target for SURF-01

### Project Decisions
- `.planning/PROJECT.md` — Key Decisions table (INFRA-01/RUN-04 atomic constraint, CLI entry point decision)
- `.planning/STATE.md` — Accumulated decisions section confirms: INFRA-01 + RUN-04 same atomic change; CLI entry point as `src/cli.ts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `opencode_run` handler (~line 63 in `src/index.ts`): The `Promise.race` timeout pattern is the exact target for INFRA-01. The handler body becomes the template for adding RUN-01/02/03 body fields.
- `opencode_get_diff` handler: returns `JSON.stringify(data)` where `data` is `Array<FileDiff>`. Needs a `.map()` to add computed `patch` fields.
- All existing Phase 3 session tools: same `async ({ ... }) => { try { const { data, error } = await client...; if (error) throw...; return { content: [{ type: 'text', text: JSON.stringify(data) }] }; } catch (err) { ... } }` pattern — CMD-01 follows this exactly.

### Established Patterns
- Zod input schemas are inline in `server.registerTool()` — no separate schema files
- Error handling: `if (error) throw new Error(JSON.stringify(error))` then catch wraps to `{ isError: true }`
- All output is `JSON.stringify(data)` — SURF-01 and SURF-02 change this for specific tools only
- `console.error` only (never `console.log` — stdout is the JSON-RPC stream)

### Integration Points
- `package.json` `bin` field: currently `{ "prefect": "./build/index.js" }` — must be updated for INFRA-02 CLI
- `tsconfig.json`: currently compiles `src/index.ts` → `build/index.js`. Needs to also compile `src/cli.ts` → `build/cli.js` (or include all `src/*.ts`)
- No new files needed for RUN-01/02/03/04, SURF-01, SURF-02, CMD-01 — all changes go into `src/index.ts`

</code_context>

<specifics>
## Specific Ideas

- `diff` library: use `createPatch(filename, before, after)` — this returns the complete unified diff string including the `--- a/file` / `+++ b/file` header. The `filename` arg is `d.file` from the FileDiff.
- `prefect init --force` semantics: JSON.parse the existing `.mcp.json`, set `mcpServers.prefect = <template>`, JSON.stringify back. Do NOT replace the root object.
- AbortController pattern: `const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); try { const result = await client.session.prompt({ ..., signal: controller.signal }); clearTimeout(timer); ... } catch (err) { if (err.name === 'AbortError') throw new Error('timed out...'); throw err; }`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-run-options-structured-responses-infrastructure*
*Context gathered: 2026-04-27*
