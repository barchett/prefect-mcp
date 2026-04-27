---
phase: 04-run-options-structured-responses-infrastructure
verified: 2026-04-27T18:30:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Confirm opencode_run behaves correctly on timeout: set PREFECT_TIMEOUT_MS=1 and call opencode_run against a live OpenCode server, verify the response contains the 'timed out after' message and the in-flight TCP connection is cancelled"
    expected: "Returns isError: true with 'opencode_run timed out after 0s' message; OpenCode server does not continue processing the prompt after abort"
    why_human: "Cannot verify TCP cancellation behavior programmatically without a live OpenCode server; AbortController wiring is confirmed in code but runtime behavior requires a live server"
  - test: "Confirm opencode_get_diff returns patch field when called against a live session with file changes"
    expected: "Each FileDiff element contains a non-empty 'patch' string starting with '---' and ending with line counts"
    why_human: "createPatch library is verified with unit tests and spot-checks, but end-to-end response shape requires a live OpenCode session with actual file changes"
  - test: "Confirm prefect init creates a working .mcp.json that Claude Code can use to spawn the MCP server"
    expected: "Running 'prefect init' in a project, then opening Claude Code, causes Claude Code to discover and connect to the Prefect MCP server via the generated .mcp.json"
    why_human: "CLI integration tests verify the file is written correctly; but actual Claude Code discovery/spawn requires a live Claude Code session to validate end-to-end"
---

# Phase 4: Run Options + Structured Responses + Infrastructure Verification Report

**Phase Goal:** `opencode_run` is the reliable, feature-complete backbone of the Prefect workflow — supporting model/agent/system overrides, async fire-and-forget, structured response surfaces, and a correct timeout that actually cancels in-flight requests.

**Verified:** 2026-04-27T18:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                 | Status     | Evidence                                                                                                    |
|----|-----------------------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------|
| 1  | Claude Code can run a prompt against a specific non-default model by passing `providerID` + `modelID` together        | ✓ VERIFIED | `src/index.ts` lines 76–82: `model: z.object({ providerID: z.string(), modelID: z.string() }).optional()`; forwarded via conditional spread at line 97                |
| 2  | Claude Code can inject a custom system prompt for a single prompt without affecting session config                    | ✓ VERIFIED | `agent: z.string().optional()` (line 84) and `system: z.string().optional()` (line 86) in opencode_run inputSchema; conditionally spread into body at lines 98–99     |
| 3  | Claude Code can fire a prompt and return immediately without blocking, using `opencode_prompt_async`                  | ✓ VERIFIED | `opencode_prompt_async` registered at lines 137–177; calls `client.session.promptAsync()`; returns `{ sessionId, accepted: true }` with no AbortController             |
| 4  | `opencode_get_diff` returns a top-level `patch` string field per FileDiff                                             | ✓ VERIFIED | `src/index.ts` lines 196–200: `createPatch(d.file, d.before, d.after)` mapped over data; original fields preserved via spread                                        |
| 5  | `opencode_run` returns a structured `parts` array validated by PartSchema                                             | ✓ VERIFIED | `src/index.ts` line 106: `PartSchema.array().parse(data!.parts)`; response shape is `JSON.stringify({ info: data!.info, parts: validatedParts })`                     |
| 6  | A timed-out `opencode_run` cancels the in-flight HTTP connection (not just the Promise)                               | ✓ VERIFIED | `src/index.ts` lines 90–91: `new AbortController()` + `setTimeout(() => controller.abort(), TIMEOUT_MS)`; `signal: controller.signal` at line 101; Promise.race fully removed (line 64 is a comment only) |
| 7  | A developer can run `prefect init` to write a correct `.mcp.json` without manual JSON editing                         | ✓ VERIFIED | `src/cli.ts` exists with four-case merge logic; `package.json` bin points to `./build/cli.js`; 6/6 CLI integration tests pass; `build/cli.js` is executable           |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact               | Expected                                        | Status      | Details                                                                                     |
|------------------------|-------------------------------------------------|-------------|---------------------------------------------------------------------------------------------|
| `src/parts.ts`         | Zod schemas for 12 Part types, ToolState, ApiError | ✓ VERIFIED | 231 lines; exports PartSchema (discriminatedUnion on 'type'), ToolStateSchema (discriminatedUnion on 'status'), ApiErrorSchema; all 12 discriminators present; no z.any() or .passthrough() |
| `src/parts.test.ts`    | Runtime parse tests for all 12 Part types       | ✓ VERIFIED | 11 test() calls using node:test; all pass via `npm test`                                    |
| `src/index.ts`         | Updated opencode_run + new tools                | ✓ VERIFIED | opencode_run uses AbortController; model/agent/system body fields present; PartSchema wired; opencode_prompt_async and opencode_session_command registered |
| `src/cli.ts`           | prefect init CLI with merge-not-overwrite logic | ✓ VERIFIED | 74 lines; shebang present; fileURLToPath(import.meta.url) for absolute path; all 4 D-17 merge cases implemented |
| `src/cli.test.ts`      | Integration tests for 4 merge cases + edge cases | ✓ VERIFIED | 6 test() calls; all pass via `npm test`                                                     |
| `package.json`         | bin, build script, test script, diff dependency | ✓ VERIFIED | bin.prefect = ./build/cli.js; build chmods both artifacts; diff ^7.0.0 in dependencies; @types/diff in devDependencies |
| `build/cli.js`         | Compiled CLI with shebang, executable           | ✓ VERIFIED | exists, executable bit set (`test -x` passes)                                                |
| `build/parts.js`       | Compiled Part schemas                           | ✓ VERIFIED | exists, compiles cleanly                                                                     |

---

### Key Link Verification

| From                                  | To                                      | Via                                        | Status      | Details                                                                          |
|---------------------------------------|-----------------------------------------|--------------------------------------------|-------------|----------------------------------------------------------------------------------|
| `src/index.ts (opencode_run)`         | `src/parts.ts (PartSchema)`             | `import { PartSchema } from './parts.js'`  | ✓ WIRED     | Line 7: import confirmed; line 106: `PartSchema.array().parse(data!.parts)` confirmed |
| `src/index.ts (opencode_run)`         | `@opencode-ai/sdk client.session.prompt` | `signal: controller.signal`               | ✓ WIRED     | Line 101: signal forwarded to SDK call                                            |
| `src/index.ts (opencode_prompt_async)` | `client.session.promptAsync`            | fire-and-forget, no AbortController       | ✓ WIRED     | Line 158: `client.session.promptAsync()` called; no AbortController in this tool |
| `src/index.ts (opencode_get_diff)`    | `diff npm package createPatch`          | named import + .map() call                | ✓ WIRED     | Line 6: `import { createPatch } from 'diff'`; line 198: `createPatch(d.file, d.before, d.after)` |
| `src/index.ts (opencode_session_command)` | `client.session.command`            | registerTool with command/arguments body  | ✓ WIRED     | Line 530: `client.session.command()` called; plain string model confirmed        |
| `package.json bin`                    | `build/cli.js`                          | npm bin resolution                        | ✓ WIRED     | `"prefect": "./build/cli.js"` confirmed in package.json                          |
| `src/cli.ts`                          | `build/index.js`                        | fileURLToPath(import.meta.url) path resolve | ✓ WIRED   | Lines 9–10: `dirname(fileURLToPath(import.meta.url))` + `resolve(__dirname, 'index.js')` |

---

### Data-Flow Trace (Level 4)

| Artifact                 | Data Variable    | Source                                   | Produces Real Data | Status        |
|--------------------------|------------------|------------------------------------------|--------------------|---------------|
| `opencode_run handler`   | `validatedParts` | `client.session.prompt()` SDK response   | Yes (live API call) | ✓ FLOWING    |
| `opencode_get_diff handler` | `withPatch`   | `client.session.diff()` + `createPatch()` | Yes (live API + pure computation) | ✓ FLOWING |
| `opencode_prompt_async`  | `{ sessionId, accepted: true }` | `client.session.promptAsync()` 204 response | Yes (static on success, real error on failure) | ✓ FLOWING |
| `src/cli.ts`             | `.mcp.json` file | `process.cwd()` + `fileURLToPath(import.meta.url)` | Yes (real file I/O) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior                              | Command                                                                                          | Result  | Status  |
|---------------------------------------|--------------------------------------------------------------------------------------------------|---------|---------|
| Build compiles cleanly                | `npm run build`                                                                                  | Exit 0  | ✓ PASS  |
| All declared tests pass               | `npm test` (17 tests: 11 parts + 6 CLI)                                                         | 17/17   | ✓ PASS  |
| Additional tests pass (not in npm test) | `node --test build/diff-patch.test.js build/session-command.test.js`                          | 13/13   | ✓ PASS  |
| diff library produces valid patch     | `node -e "const { createPatch } = require('./node_modules/diff'); ..."`                          | "createPatch sanity: OK" | ✓ PASS |
| Promise.race in active code           | `grep -n "Promise.race" src/index.ts`                                                            | Line 64 = comment only | ✓ PASS |
| AbortController count                 | `grep -c "AbortController" src/index.ts`                                                         | 2 (new + comment ref) | ✓ PASS |
| clearTimeout in both paths            | `grep -c "clearTimeout(timer)" src/index.ts`                                                     | 2       | ✓ PASS  |
| PartSchema.array().parse              | `grep -c "PartSchema.array().parse" src/index.ts`                                                | 1       | ✓ PASS  |
| opencode_prompt_async fires promptAsync | `grep -c "client.session.promptAsync" src/index.ts`                                           | 1       | ✓ PASS  |
| prefect init Case 1 (fresh .mcp.json) | CLI test Case 1 in `build/cli.test.js`                                                          | Pass    | ✓ PASS  |
| MCP server boots                      | `timeout 3 node build/index.js < /dev/null` (checked via test infrastructure)                    | No crash (exits on timeout) | ? SKIP (needs live server) |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                 | Status        | Evidence                                                                               |
|-------------|-------------|-----------------------------------------------------------------------------|---------------|----------------------------------------------------------------------------------------|
| RUN-01      | 04-02       | opencode_run model override (providerID + modelID required together)        | ✓ SATISFIED   | z.object({ providerID, modelID }).optional() in inputSchema; conditional spread in body |
| RUN-02      | 04-02       | opencode_run agent override per prompt                                      | ✓ SATISFIED   | agent: z.string().optional() in inputSchema; conditional spread in body                |
| RUN-03      | 04-02       | opencode_run system prompt override per prompt                              | ✓ SATISFIED   | system: z.string().optional() in inputSchema; conditional spread in body               |
| RUN-04      | 04-02       | New opencode_prompt_async tool (POST /session/:id/prompt_async, 204 void)  | ✓ SATISFIED   | opencode_prompt_async registered; calls client.session.promptAsync; returns { sessionId, accepted: true } |
| SURF-01     | 04-03       | opencode_get_diff surfaces patch as top-level string field per FileDiff     | ✓ SATISFIED   | createPatch imported from diff; withPatch map adds patch field; original fields preserved via spread |
| SURF-02     | 04-01+04-02 | opencode_run returns structured parts array validated by PartSchema         | ✓ SATISFIED   | src/parts.ts with 12-member discriminated union; PartSchema.array().parse() in opencode_run |
| INFRA-01    | 04-02       | opencode_run uses AbortController instead of Promise.race                   | ✓ SATISFIED   | AbortController + signal forwarded; clearTimeout in both success and catch paths; Promise.race removed from active code |
| INFRA-02    | 04-04       | prefect init CLI writes correct .mcp.json with merge-not-overwrite semantics | ✓ SATISFIED  | src/cli.ts with 4-case merge logic; absolute path via fileURLToPath; bin repointed; 6/6 tests pass |
| CMD-01      | 04-03       | opencode_session_command runs slash commands inside a session               | ✓ SATISFIED   | opencode_session_command registered; calls client.session.command; plain string model field |

**Note on CMD-01:** CMD-01 is listed as a Phase 4 requirement in ROADMAP.md but has no formal definition in REQUIREMENTS.md (no `**CMD-01**:` entry, no traceability row). The implementation exists and is correct — this is a documentation gap only.

**Note on REQUIREMENTS.md traceability:** The traceability table still shows "Pending" for all Phase 4 requirements. The checkboxes in the requirement body (`[x]`) are updated, but the table rows were not updated to reflect completion.

---

### Anti-Patterns Found

| File           | Line | Pattern                                                      | Severity  | Impact                                                                                                                         |
|----------------|------|--------------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------------------------|
| `src/index.ts` | 106  | `PartSchema.array().parse(data!.parts)` — strict parse that throws on unknown part types | ⚠️ Warning | If OpenCode adds a new part type upstream, opencode_run will throw a ZodError and return isError: true with a non-specific message. Callers cannot distinguish schema mismatch from network failure. |
| `src/index.ts` | 106+111 | `data!.parts` and `data!.info` — non-null assertions after error guard | ⚠️ Warning | SDK can return `{ data: null, error: null }` in edge cases; the non-null assertions would throw. The `if (error) throw` guard does not fully protect against null data. |
| `src/index.ts` | 11   | `parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10)` — NaN on malformed input | ⚠️ Warning | Malformed env var (e.g. "120s" or empty string) silently produces NaN; `setTimeout(fn, NaN)` fires immediately in Node.js, causing every opencode_run to abort instantly |
| `src/index.ts` | 541  | `opencode_session_command` returns `JSON.stringify(data)` without PartSchema validation | ⚠️ Warning | Inconsistency with opencode_run which validates parts; callers get different shapes from the same endpoint type |
| `package.json` | 7    | `test` script omits `build/diff-patch.test.js` and `build/session-command.test.js` | ⚠️ Warning | 13 tests exist and pass but are silently skipped by `npm test`; CI coverage gap |
| `src/parts.ts` | 81   | `z.lazy(() => FilePartSchema)` — unnecessary lazy reference (FilePartSchema defined above) | ℹ️ Info   | No functional impact; minor runtime overhead and slightly obscured type inference |
| `src/parts.test.ts` | 6-11 | Unused named imports (TextPartSchema, FilePartSchema, ToolPartSchema, etc.) | ℹ️ Info | No functional impact; adds noise and may generate warnings with noUnusedLocals |

**Stub classification note:** None of the anti-patterns above prevent goal achievement. The parse/validation patterns (WR-01, WR-02) are latent bugs that surface only when OpenCode emits unexpected data; all tools are fully functional under normal conditions. The test script gap (IN-01) means tests exist but aren't in the default `npm test` run.

---

### Human Verification Required

#### 1. AbortController TCP Cancellation at Runtime

**Test:** Start OpenCode, create a session, set `PREFECT_TIMEOUT_MS=100` (100ms), call `opencode_run` with a complex prompt, observe that the tool returns the timeout message and that the OpenCode server log shows the request was cancelled (not completed)
**Expected:** Returns `isError: true` with `"opencode_run timed out after 0s — check OPENCODE_URL and model endpoint"` message; OpenCode server shows connection reset, not a completed response
**Why human:** Cannot verify TCP cancellation behavior programmatically without a live OpenCode server; AbortController signal forwarding is confirmed in code (line 101) but the runtime effect requires an active HTTP connection

#### 2. opencode_get_diff patch field end-to-end

**Test:** Create a session, run a prompt that modifies a file, call `opencode_get_diff`, inspect the response
**Expected:** Response is an array of objects each containing `{ file, before, after, additions, deletions, patch }` where `patch` is a non-empty unified diff string beginning with `--- ` header lines
**Why human:** createPatch library is verified with unit tests but the end-to-end response shape from a live session requires actual file changes via OpenCode

#### 3. prefect init .mcp.json works with Claude Code

**Test:** Run `prefect init` in a project directory, open Claude Code in that directory, verify the MCP server appears in Claude Code's tool list
**Expected:** Claude Code discovers and connects to the Prefect MCP server; tools like `opencode_create_session` appear in Claude Code
**Why human:** CLI integration tests verify the file content is correct; Claude Code's MCP discovery behavior (parsing .mcp.json and spawning the server) cannot be tested programmatically

---

### Gaps Summary

No implementation gaps found. All 7 phase success criteria and all 9 declared requirements are satisfied by existing code with automated tests passing (17/17 via `npm test`, 30/30 total across all test files).

**Documentation gaps (informational only, not implementation failures):**

1. **CMD-01 absent from REQUIREMENTS.md:** ROADMAP.md declares CMD-01 as a Phase 4 requirement but REQUIREMENTS.md has no `**CMD-01**:` definition and no traceability row. The implementation is complete and correct — the gap is documentation only.

2. **REQUIREMENTS.md traceability table shows "Pending":** All Phase 4 requirement rows still show `| Pending |` in the traceability table despite being implemented and the checkbox entries showing `[x]`. This is a tracking update that was not performed.

3. **2 test files excluded from `npm test`:** `build/diff-patch.test.js` (7 tests) and `build/session-command.test.js` (6 tests) exist and pass when run directly but are not in the `package.json` `test` script. Total test count is 30 across all files, but `npm test` only exercises 17.

**Code quality warnings (from code review, not blocking goal achievement):**

- WR-01: `PartSchema.array().parse()` uses strict parse; would throw on unknown future part types
- WR-02: `opencode_session_command` skips PartSchema validation unlike `opencode_run`
- WR-03: `PREFECT_TIMEOUT_MS` NaN on malformed input silently causes immediate abort

---

_Verified: 2026-04-27T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
