# Roadmap: Prefect

## Milestones

- **v1.0 MVP** — Phases 1–2 (shipped 2026-04-26)
- **v2.0 Session Management + Run Options + Infrastructure** — Phases 3–4 (shipped 2026-04-27)
- **v3.0 Daily Driver** — Phases 5–9 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1–2) — SHIPPED 2026-04-26</summary>

- [x] **Phase 1: MCP Server** (3/3 plans) — completed 2026-04-26
- [x] **Phase 2: Wiring & Validation** (2/2 plans) — completed 2026-04-26

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v2.0 Session Management + Run Options + Infrastructure (Phases 3–4) — SHIPPED 2026-04-27</summary>

- [x] **Phase 3: Session Management Tools** (2/2 plans) — completed 2026-04-27
- [x] **Phase 4: Run Options + Structured Responses + Infrastructure** (4/4 plans) — completed 2026-04-27

Full archive: `.planning/milestones/v2.0-ROADMAP.md`

</details>

### v3.0 Daily Driver (Phases 5–9)

- [x] **Phase 5: Directory Infrastructure** — `resolveDirectory()` helper + directory param on all 18 existing tools + `OPENCODE_DEFAULT_PROJECT` env var (completed 2026-04-28)
- [ ] **Phase 6: Auth + Auto-start** — HTTP Basic Auth fetch wrapper + automatic `opencode serve` startup with health polling
- [ ] **Phase 7: Composite Tools** — Handler extraction refactor then opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await
- [ ] **Phase 8: Read-only API Wrappers** — opencode_list_agents, opencode_list_providers, opencode_find_symbol
- [ ] **Phase 9: npm Distribution** — tool rename (`opencode_*` → `prefect_*`), env var rename (`OPENCODE_*` → `PREFECT_*`), package.json fields, pack verification, global install pathway, README + CLAUDE.md docs

---

## Phase Details

### Phase 3: Session Management Tools

**Goal**: Claude Code can inspect, navigate, and manage OpenCode sessions without leaving the MCP workflow.

**Depends on**: Phase 2 (v1.0 MCP server baseline)

**Requirements**: SESSION-01, SESSION-02, SESSION-03, SESSION-04, SESSION-05, SESSION-06, SESSION-07, SESSION-08, SESSION-09

**Success Criteria** (what must be TRUE):
  1. Claude Code can list all sessions and identify one by ID, title, or directory without any manual API calls
  2. Claude Code can retrieve full message history for a session (all messages or a limited slice), and fetch a single message by ID
  3. Claude Code can check real-time session status (idle/busy/retrying) across all active sessions before deciding to call `opencode_run`
  4. Claude Code can delete a session it no longer needs and rename a session for clarity
  5. Claude Code can list child sessions of a forked session and unrevert a session to undo a prior revert

**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Read-only session tools: opencode_session_list, opencode_session_get, opencode_session_status, opencode_session_messages, opencode_session_message (SESSION-01 to SESSION-05)
- [x] 03-02-PLAN.md — Write/mutating session tools: opencode_session_delete, opencode_session_rename, opencode_session_children, opencode_session_unrevert (SESSION-06 to SESSION-09)

---

### Phase 4: Run Options + Structured Responses + Infrastructure

**Goal**: `opencode_run` is the reliable, feature-complete backbone of the Prefect workflow — supporting model/agent/system overrides, async fire-and-forget, structured response surfaces, and a correct timeout that actually cancels in-flight requests.

**Depends on**: Phase 3

**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, SURF-01, SURF-02, INFRA-01, INFRA-02, CMD-01

**Success Criteria** (what must be TRUE):
  1. Claude Code can run a prompt against a specific non-default model by passing `providerID` + `modelID` together (rejected if only one is supplied), and can select a specific agent type per prompt
  2. Claude Code can inject a custom system prompt for a single prompt without affecting the session's persistent configuration
  3. Claude Code can fire a prompt and return immediately without blocking, using `opencode_prompt_async`
  4. `opencode_get_diff` returns a top-level `patch` string field and `opencode_run` returns a structured `parts` array with each part tagged by kind — callers can navigate responses without raw JSON parsing
  5. A timed-out `opencode_run` cancels the in-flight HTTP connection to OpenCode (not just the Promise), preventing orphaned requests
  6. A developer cloning the repo can run `prefect init` to write a correct `.mcp.json` into their project without manual JSON editing
  7. Claude Code can execute slash commands (e.g. `/summarize`, `/compact`) inside a session by calling `opencode_session_command`

**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Zod schemas for the 12-member Part discriminated union (SURF-02 schemas in src/parts.ts)
- [x] 04-02-PLAN.md — opencode_run body fields (RUN-01/02/03), AbortController timeout (INFRA-01), prompt_async tool (RUN-04), parts validation (SURF-02)
- [x] 04-03-PLAN.md — opencode_get_diff patch field via diff package (SURF-01), opencode_session_command tool (CMD-01)
- [x] 04-04-PLAN.md — prefect init CLI with merge-not-overwrite .mcp.json (INFRA-02)

---

### Phase 5: Directory Infrastructure

**Goal**: All existing tools resolve working directory consistently via a shared helper with a documented three-tier fallback.

**Depends on**: Phase 4 (v2.0 18-tool baseline)

**Requirements**: INFRA-01, INFRA-02, INFRA-03

**Success Criteria** (what must be TRUE):
  1. Passing `directory` to any of the 18 existing tools causes that call to use the specified path, not the server's cwd
  2. When no `directory` param is passed, `OPENCODE_DEFAULT_PROJECT` env var is used if set, otherwise the resolver returns `undefined` so OpenCode uses its own session-level directory tracking (locked design decision: never silently override with `process.cwd()`)
  3. Changing `OPENCODE_DEFAULT_PROJECT` in the shell takes effect on the next tool call without restarting Claude Code
  4. `npm run build` passes with zero TypeScript errors after all 18 tools are updated

**Plans**: 1 plan

Plans:
- [x] 05-01-PLAN.md — Add resolveDirectory() helper + add directory schema to all 18 tools + route every handler through the helper (INFRA-01, INFRA-02, INFRA-03)

---

### Phase 6: Auth + Auto-start

**Goal**: Prefect handles HTTP Basic Auth transparently and starts OpenCode automatically when the server is unreachable.

**Depends on**: Phase 5 (resolveDirectory needed for auto-start working directory resolution)

**Requirements**: INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10

**Success Criteria** (what must be TRUE):
  1. When `OPENCODE_SERVER_PASSWORD` is set, every HTTP request carries a correct `Authorization: Basic <token>` header and requests succeed without editing `.mcp.json`
  2. README explicitly warns that `OPENCODE_SERVER_PASSWORD` must not be placed in the `.mcp.json` env block
  3. When OpenCode is not running at first tool call, Prefect spawns it automatically and the tool call completes successfully — startup is transparent to the caller
  4. Auto-started OpenCode produces no output on the MCP stdout pipe (stderr may surface; stdout is silenced)
  5. The auto-start health poll uses authenticated headers so a password-protected server is detected as healthy rather than looping on 401

**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md — src/auth.ts (buildAuthHeader + authFetch) + README INFRA-06 warning (INFRA-04, INFRA-05, INFRA-06)
- [x] 06-02-PLAN.md — src/autostart.ts (ensureOpencodeRunning + health poll) (INFRA-07, INFRA-08, INFRA-09, INFRA-10)
- [x] 06-03-PLAN.md — Wire auth + auto-start into src/index.ts + build verification + WSL2 smoke test (INFRA-04, INFRA-05, INFRA-07, INFRA-08, INFRA-09, INFRA-10)

---

### Phase 7: Composite Tools

**Goal**: Users can delegate, dispatch, inspect, and await sessions with single tool calls instead of a manual three-step sequence.

**Depends on**: Phase 5 (resolveDirectory), Phase 6 (auth + server availability guarantee)

**Requirements**: WORKFLOW-01, WORKFLOW-02, WORKFLOW-03, WORKFLOW-04, WORKFLOW-05, WORKFLOW-06, WORKFLOW-07

**Success Criteria** (what must be TRUE):
  1. `opencode_delegate` creates a session, runs a prompt, and returns `{ sessionId, result, diff }` in one blocking call — replicating the canonical three-step loop in a single tool invocation
  2. `opencode_delegate` aborts the created session and returns an error if the run exceeds `PREFECT_TIMEOUT_MS`
  3. `opencode_dispatch` returns `{ sessionId }` immediately (fire-and-forget), allowing Claude Code to continue other work while the session runs
  4. `opencode_inspect` returns a compact `{ status, todos, changedFiles }` snapshot without fetching full message history
  5. `opencode_await` polls a dispatched session to completion and returns `{ result, diff }`, with configurable `pollIntervalMs` and `timeoutMs`
  6. All four composite tools compile cleanly and the 18 existing tools behave identically after the handler-extraction refactor

**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Handler extraction refactor: create src/handlers.ts (createSession, runPrompt, getDiff) + update three existing tools in src/index.ts to delegate (WORKFLOW-07)
- [x] 07-02-PLAN.md — Four composite tools: opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await in src/index.ts (WORKFLOW-01, WORKFLOW-02, WORKFLOW-03, WORKFLOW-04, WORKFLOW-05, WORKFLOW-06)

---

### Phase 8: Read-only API Wrappers

**Goal**: Users can list available agents, configured providers, and search workspace symbols directly from Claude Code.

**Depends on**: Phase 5 (resolveDirectory for directory-aware calls)

**Requirements**: API-01, API-02, API-03

**Success Criteria** (what must be TRUE):
  1. `opencode_list_agents` returns the agents available in an OpenCode instance, including id, name, and description fields
  2. `opencode_list_providers` returns configured providers and their models, surfacing which providers are connected/authenticated
  3. `opencode_find_symbol` accepts a query string and returns matching symbols with file path and location data
  4. `npm run build` passes with zero errors after the three tools are added

**Plans**: 1 plan

Plans:
- [ ] 08-01-PLAN.md — Three read-only tools registered in src/index.ts: opencode_list_agents, opencode_list_providers, opencode_find_symbol (API-01, API-02, API-03)

---

### Phase 9: npm Distribution

**Goal**: All tool names are renamed from `opencode_*` to `prefect_*`, Prefect is publishable as `prefect-mcp` on npm, and the canonical workflow docs (CLAUDE.md, examples/) reflect the new names.

**Depends on**: Phase 5, 6, 7, 8 (all features must be stable before publishing)

**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07, DIST-08, DIST-09, DIST-10, DIST-11, DIST-12

**Success Criteria** (what must be TRUE):
  1. `npm pack --dry-run` lists only `build/` files and `README.md` — no `node_modules/`, no `src/` TypeScript sources
  2. `package.json` contains `name: "prefect-mcp"`, `license`, `engines: { node: ">=20" }`, `publishConfig`, and `files` fields
  3. `prefect init` detects a global install and writes `"command": "prefect-mcp"` (PATH-relative bin); a local install writes the existing absolute path form
  4. README documents both install pathways: local (clone + build) and global (`npm install -g prefect-mcp`)
  5. All `opencode_*` tool names are renamed to `prefect_*` across every `*.ts` and `*.md` file, and `npm test` passes after the rename
  6. CLAUDE.md tool reference table and canonical loop steps use `prefect_*` names throughout, and the canonical loop explicitly instructs callers to always pass `directory` on every `prefect_create_session`, `prefect_delegate`, and `prefect_dispatch` call
  7. `examples/test-task.md` validation prompt uses `prefect_*` tool names
  8. All `OPENCODE_*` env vars are renamed to `PREFECT_*` across every `*.ts`, `*.md`, and test file: `OPENCODE_URL` → `PREFECT_SERVER_URL`, `OPENCODE_SERVER_PASSWORD` → `PREFECT_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME` → `PREFECT_SERVER_USERNAME`, `OPENCODE_DEFAULT_PROJECT` → `PREFECT_DEFAULT_PROJECT`; `PREFECT_TIMEOUT_MS` and `PREFECT_AUTOSTART_TIMEOUT_MS` are unchanged

**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Server | v1.0 | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | v1.0 | 2/2 | Complete | 2026-04-26 |
| 3. Session Management Tools | v2.0 | 2/2 | Complete | 2026-04-27 |
| 4. Run Options + Structured Responses + Infrastructure | v2.0 | 4/4 | Complete | 2026-04-27 |
| 5. Directory Infrastructure | v3.0 | 1/1 | Complete    | 2026-04-28 |
| 6. Auth + Auto-start | v3.0 | 0/3 | Not started | — |
| 7. Composite Tools | v3.0 | 0/2 | Not started | — |
| 8. Read-only API Wrappers | v3.0 | 0/1 | Not started | — |
| 9. npm Distribution | v3.0 | 0/? | Not started | — |
