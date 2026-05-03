# Roadmap: Prefect

## Milestones

- **v1.0 MVP** — Phases 1–2 (shipped 2026-04-26)
- **v2.0 Session Management + Run Options + Infrastructure** — Phases 3–4 (shipped 2026-04-27)
- **v3.0 Daily Driver** — Phases 5–9 (shipped 2026-04-29)
- **v4.0 API Completeness** — Phases 10–12 (shipped 2026-04-30)
- **v5.0 Multi-Server Registry** — Phases 13–15 (in progress)

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

<details>
<summary>v3.0 Daily Driver (Phases 5–9) — SHIPPED 2026-04-29</summary>

- [x] **Phase 5: Directory Infrastructure** — `resolveDirectory()` helper + directory param on all 18 existing tools + `OPENCODE_DEFAULT_PROJECT` env var (completed 2026-04-28)
- [x] **Phase 6: Auth + Auto-start** — HTTP Basic Auth fetch wrapper + automatic `opencode serve` startup with health polling (completed 2026-04-28)
- [x] **Phase 7: Composite Tools** — Handler extraction refactor then opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await (completed 2026-04-28)
- [x] **Phase 8: Read-only API Wrappers** — opencode_list_agents, opencode_list_providers, opencode_find_symbol (completed 2026-04-28)
- [x] **Phase 9: npm Distribution** — tool rename (`opencode_*` → `prefect_*`), env var rename (`OPENCODE_*` → `PREFECT_*`), package.json fields, pack verification, global install pathway, README + CLAUDE.md docs (completed 2026-04-29)

Full archive: `.planning/milestones/v3.0-ROADMAP.md`

</details>

<details>
<summary>v4.0 API Completeness (Phases 10–12) — SHIPPED 2026-04-30</summary>

- [x] **Phase 10: Run + Session Param Additions** — RUN-05..08 body field additions to `prefect_run` + SESSION-10 parentID param on `prefect_create_session` (completed 2026-04-29)
- [x] **Phase 11: Session Lifecycle Tools** — SESSION-11 summarize, SESSION-12 todo, SESSION-13 init, SESSION-15 share, SESSION-16 unshare (completed 2026-04-30)
- [x] **Phase 12: Shell + Workspace API Wrappers** — SESSION-14 shell, API-04 vcs_info, API-05 file_status, API-06 list_mcp_servers, API-07 inject_mcp_server, API-08 list_tools (completed 2026-04-30)

Full archive: `.planning/milestones/v4.0-ROADMAP.md`

</details>

### v5.0 Multi-Server Registry (Phases 13–15)

- [x] **Phase 13: Server Registry** — MULTI-01..04: CLI add-server/remove-server/list-servers commands + `~/.config/prefect/servers.json` persistence (completed 2026-05-01)
- [ ] **Phase 14: Session-Server Routing** — MULTI-05..07: `server` param on 3 entry points, session→server map in `~/.config/prefect/sessions.json`, stale-session handling, server-aware `ensureOpencodeRunning()`
- [x] **Phase 15: Onboarding + Session Reuse** — MULTI-08..10: CLAUDE.md server registry docs, `prefect init` first-server prompt, optional `sessionId` on delegate/dispatch (completed 2026-05-03)

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
- [x] 08-01-PLAN.md — Three read-only tools registered in src/index.ts: opencode_list_agents, opencode_list_providers, opencode_find_symbol (API-01, API-02, API-03)

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

**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Code rename (opencode_* → prefect_*) in src/*.ts + env var soft migration in src/index.ts, src/auth.ts, src/config.ts, src/autostart.ts + test files updated to PREFECT_* names + package.json publishing fields with dual bin entries; gate: `npm test` passes (DIST-01, DIST-02, DIST-03, DIST-07, DIST-08, DIST-12)
- [x] 09-02-PLAN.md — Docs rename (CLAUDE.md, README.md, examples/test-task.md) + add directory-arg instruction to CLAUDE.md canonical loop + add global install pathway to README + global install detection in src/cli.ts + `npm pack --dry-run` verification (DIST-04, DIST-05, DIST-06, DIST-07, DIST-09, DIST-10, DIST-11, DIST-12)

---

### Phase 10: Run + Session Param Additions

**Goal**: `prefect_run` accepts the full set of prompt body fields (tools override, file attachments, message resume, structured agent inputs) and `prefect_create_session` accepts a parentID for session hierarchies.

**Depends on**: Phase 9 (stable v3.0 baseline with prefect_* naming)

**Requirements**: RUN-05, RUN-06, RUN-07, RUN-08, SESSION-10

**Success Criteria** (what must be TRUE):
  1. Calling `prefect_run` with a `tools` record (Map<string, boolean>) causes only the enabled tools to be available for that prompt; omitting the field leaves the default tool set unchanged
  2. Calling `prefect_run` with a `files` array of FilePartInput objects attaches the specified files as context for that prompt
  3. Calling `prefect_run` with a `messageID` string assigns that ID to the new user message; if a message with that ID already exists, OpenCode returns the cached response (idempotency for safe retries) — for branching at a prior message use `prefect_fork`
  4. Calling `prefect_run` with `agentInput` or `subtaskInput` sends those structured fields in the prompt body; all four new fields are independently optional
  5. Calling `prefect_create_session` with a `parentID` string creates a child session linked to the given parent; `npm run build` passes with zero errors after all changes
  6. `prefect_prompt_async` carries the same five new optional fields for parity with `prefect_run` (zero-risk additive symmetry — bodies share the same SDK shape)

**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md — Extend RunPromptOptions/runPrompt/createSession in src/handlers.ts + extend Zod schemas and handlers on prefect_run, prefect_prompt_async, prefect_create_session in src/index.ts (RUN-05, RUN-06, RUN-07, RUN-08, SESSION-10)

---

### Phase 11: Session Lifecycle Tools

**Goal**: Claude Code can trigger session summarization, inspect the session todo list, generate an AGENTS.md file, and share or unshare a session — completing the non-shell session lifecycle surface.

**Depends on**: Phase 10

**Requirements**: SESSION-11, SESSION-12, SESSION-13, SESSION-15, SESSION-16

**Success Criteria** (what must be TRUE):
  1. `prefect_session_summarize` triggers summary generation for a session and returns the result without error
  2. `prefect_session_todo` returns the current todo list for a session as a structured response
  3. `prefect_session_init` triggers AGENTS.md generation for the session's project and returns confirmation
  4. `prefect_session_share` makes a session shareable and returns the share URL or confirmation; `prefect_session_unshare` removes sharing and returns confirmation
  5. `npm run build` passes with zero errors after all five tools are registered

**Plans**: 1 plan

Plans:
- [x] 11-01-PLAN.md — Five session lifecycle tools registered in src/index.ts: prefect_session_summarize, prefect_session_todo, prefect_session_init, prefect_session_share, prefect_session_unshare (SESSION-11, SESSION-12, SESSION-13, SESSION-15, SESSION-16)

---

### Phase 12: Shell + Workspace API Wrappers

**Goal**: Claude Code can execute shell commands within a session's context and query the full workspace API surface — VCS info, file status, MCP server inspection and injection, experimental tool introspection, file lookup, file content retrieval, config inspection, and slash-command enumeration.

**Depends on**: Phase 11

**Requirements**: SESSION-14, API-04, API-05, API-06, API-07, API-08, API-09, API-10, API-11, API-12

**Success Criteria** (what must be TRUE):
  1. `prefect_session_shell` sends a shell command to the session's context and returns the command output; the tool schema and description clearly communicate the elevated risk of arbitrary shell execution
  2. `prefect_vcs_info` returns structured VCS/git info for the workspace (branch, commit, dirty status) without requiring any shell calls from the caller
  3. `prefect_file_status` returns git-tracked file status for the workspace as a structured list
  4. `prefect_list_mcp_servers` returns the MCP servers configured in the OpenCode instance; `prefect_inject_mcp_server` adds an MCP server to the OpenCode config at runtime and returns confirmation
  5. `prefect_list_tools` returns the available tools per model by calling GET /experimental/tool/ids and GET /experimental/tool, surfacing which tools each model supports
  6. `prefect_find_file` finds a file in the workspace by name/pattern using GET /find/file and returns matching paths
  7. `prefect_get_file_content` returns the content of a file in the workspace using GET /file/content
  8. `prefect_get_config` returns the current OpenCode configuration using GET /config
  9. `prefect_list_commands` returns available slash commands using GET /command, complementing `prefect_session_command`
  10. `npm run build` passes with zero errors after all ten tools are registered

**Plans**: 1 plan

Plans:
- [x] 12-01-PLAN.md — Ten tools: prefect_session_shell, prefect_vcs_info, prefect_file_status, prefect_list_mcp_servers, prefect_inject_mcp_server, prefect_list_tools, prefect_find_file, prefect_get_file_content, prefect_get_config, prefect_list_commands (SESSION-14, API-04..API-12)

---

### Phase 13: Server Registry

**Goal**: Users can register, remove, and list named OpenCode servers via CLI commands, with the registry persisted to `~/.config/prefect/servers.json` and read at every invocation.

**Depends on**: Phase 12 (v4.0 stable baseline)

**Requirements**: MULTI-01, MULTI-02, MULTI-03, MULTI-04

**Success Criteria** (what must be TRUE):
  1. Running `prefect add-server <name> <host> <port> <model>` registers the server and the entry is visible in `~/.config/prefect/servers.json` immediately
  2. Running `prefect remove-server <name>` removes the entry from the registry; attempting to remove a name that does not exist produces a clear error message, not a silent no-op
  3. Running `prefect list-servers` prints a tabular view of all registered servers (name, host, port, model) — empty registry prints an informative message rather than an error
  4. The registry file is read fresh on every CLI invocation — restarting the MCP server is not required for registry changes to take effect
  5. `npm run build` passes with zero errors after all three CLI subcommands are added

**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md — registry.ts module with readRegistry/writeRegistry/addServer/removeServer/listServers + registry.test.ts (TDD; MULTI-01..04)
- [x] 13-02-PLAN.md — cli.ts subcommand dispatch (add-server / remove-server / list-servers) + updated usageAndExit + cli.test.ts integration tests (MULTI-01..04)

---

### Phase 14: Session-Server Routing

**Goal**: Tool calls are routed to the correct named server transparently — `server` param on the three entry points, session→server map in `sessions.json`, stale-session cleanup, and server-aware auto-start.

**Depends on**: Phase 13 (server registry must exist before routing can look servers up)

**Requirements**: MULTI-05, MULTI-06, MULTI-07

**Success Criteria** (what must be TRUE):
  1. Calling `prefect_create_session`, `prefect_delegate`, or `prefect_dispatch` with a `server` param routes the call to that named server; omitting `server` falls back to the first registered server, then to `PREFECT_SERVER_URL`
  2. After a session is created (by any of the three entry points), the sessionId→server mapping is immediately written to `~/.config/prefect/sessions.json` so subsequent tool calls on that session find the right server after an MCP restart
  3. When a tool call on a stored sessionId receives a 404 from OpenCode (server was restarted), the stale entry is removed from `sessions.json` and the error surfaced to the caller describes the situation and next action (create a new session)
  4. `ensureOpencodeRunning()` starts the correct OpenCode instance — using host and port from the named server's registry entry rather than the global default — when the targeted server is not reachable
  5. `npm run build` passes with zero errors after all routing changes

**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md — sessions.ts SessionMap module + sessions.test.ts (MULTI-06 persistence layer)
- [x] 14-02-PLAN.md — autostart.ts ensureOpencodeRunning(ServerEntry) refactor + autostart.test.ts rewrite + fetch.ts caller update (MULTI-07)
- [x] 14-03-PLAN.md — handlers.ts createSession sessions.json write + index.ts getClient/resolveServerUrl/isNotFound helpers + server param on 3 entry points + 40 handler substitutions with D-12 stale-session detection (MULTI-05, MULTI-06)

---

### Phase 15: Onboarding + Session Reuse

**Goal**: CLAUDE.md documents the server registry for informed routing, `prefect init` guides first-server registration, and `prefect_delegate`/`prefect_dispatch` accept an optional `sessionId` for multi-pass session reuse.

**Depends on**: Phase 14 (routing infrastructure must be in place before session reuse is safe)

**Requirements**: MULTI-08, MULTI-09, MULTI-10

**Success Criteria** (what must be TRUE):
  1. CLAUDE.md contains a `## Available Workers` section that lists available worker servers so Claude Code can decide which server to route work to without reading config files directly (D-01: section named "Available Workers", not "Server Registry")
  2. Running `prefect init` in a fresh project with no registered servers prints a static example `add-server` command (D-06: no env var pre-population — guidance is always the same static example)
  3. Calling `prefect_delegate` or `prefect_dispatch` with an existing `sessionId` reuses that session on its already-registered server — the `server` param is ignored and no new session is created
  4. Calling `prefect_delegate` or `prefect_dispatch` without `sessionId` requires `server` and creates a new session on that server, as before
  5. `npm run build` passes and `examples/test-task.md` is updated to reflect the new `sessionId` reuse capability

**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md — updateClaudemdWorkers() in cli.ts (MULTI-08) + prefect init first-server guidance (MULTI-09) + cli.test.ts tests
- [x] 15-02-PLAN.md — sessionId optional param on prefect_delegate + prefect_dispatch in index.ts (MULTI-10) + examples/test-task.md update

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Server | v1.0 | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | v1.0 | 2/2 | Complete | 2026-04-26 |
| 3. Session Management Tools | v2.0 | 2/2 | Complete | 2026-04-27 |
| 4. Run Options + Structured Responses + Infrastructure | v2.0 | 4/4 | Complete | 2026-04-27 |
| 5. Directory Infrastructure | v3.0 | 1/1 | Complete | 2026-04-28 |
| 6. Auth + Auto-start | v3.0 | 3/3 | Complete | 2026-04-28 |
| 7. Composite Tools | v3.0 | 2/2 | Complete | 2026-04-28 |
| 8. Read-only API Wrappers | v3.0 | 1/1 | Complete | 2026-04-28 |
| 9. npm Distribution | v3.0 | 2/2 | Complete | 2026-04-29 |
| 10. Run + Session Param Additions | v4.0 | 1/1 | Complete | 2026-04-29 |
| 11. Session Lifecycle Tools | v4.0 | 1/1 | Complete | 2026-04-30 |
| 12. Shell + Workspace API Wrappers | v4.0 | 1/1 | Complete | 2026-04-30 |
| 13. Server Registry | v5.0 | 2/2 | Complete    | 2026-05-01 |
| 14. Session-Server Routing | v5.0 | 0/3 | Not started | - |
| 15. Onboarding + Session Reuse | v5.0 | 2/2 | Complete    | 2026-05-03 |

### Phase 15.1: MULTI-11: Server capacity management — maxSessions field on ServerEntry, --max-sessions flag on add-server, capacity check before createSession in prefect_create_session/prefect_delegate/prefect_dispatch (error only when maxSessions is set; omit entirely if unlimited), capacity column in list-servers, capacity in CLAUDE.md workers section. Backward compatible — no maxSessions = unlimited. (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 15
**Plans:** 2/2 plans complete

Plans:
- [ ] TBD (run /gsd-plan-phase 15.1 to break down)
