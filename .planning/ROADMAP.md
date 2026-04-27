# Roadmap: Prefect

## Milestones

- ✅ **v1.0 MVP** — Phases 1–2 (shipped 2026-04-26)
- 📋 **v2.0 Session Management + Run Options + Infrastructure** — Phases 3–4 (planned)
- 📋 **v3.0 Full API Coverage** — Phases 5–6 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–2) — SHIPPED 2026-04-26</summary>

- [x] **Phase 1: MCP Server** (3/3 plans) — completed 2026-04-26
- [x] **Phase 2: Wiring & Validation** (2/2 plans) — completed 2026-04-26

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 📋 v2.0 Session Management + Run Options + Infrastructure (Planned)

- [ ] **Phase 3: Session Management Tools** — 9 new read/write session tools: `opencode_session_list`, `opencode_session_get`, `opencode_session_status`, `opencode_session_messages`, `opencode_session_message`, `opencode_session_delete`, `opencode_session_rename`, `opencode_session_children`, `opencode_session_unrevert`
- [ ] **Phase 4: Run Options + Structured Responses + Infrastructure** — `model`/`agent`/`system` on `opencode_run`; `opencode_prompt_async` fire-and-forget tool; `patch` field surfaced on `opencode_get_diff`; `parts` typed array on `opencode_run` response; AbortController timeout fix replacing `Promise.race`; `prefect init` CLI writes `.mcp.json`

### 📋 v3.0 Full API Coverage (Planned)

- [ ] **Phase 5: Advanced Run Options** — `tools`, `FilePartInput`, `messageID`, `AgentPartInput`/`SubtaskPartInput` on `opencode_run`; `parentID` on `opencode_create_session`; `npm install -g` install pathway (requires npm publish)
- [ ] **Phase 6: Session Utilities + Workspace APIs** — `session.summarize` (POST /session/:id/summarize), `session.todo` (GET /session/:id/todo), `session.init` (POST /session/:id/init), `session.command` (POST /session/:id/command), `session.shell` (POST /session/:id/shell), `session.share`/`session.unshare` (POST+DELETE /session/:id/share); GET /find/symbol, GET /vcs, GET /file/status, GET+POST /mcp, GET /experimental/tool/ids, GET /experimental/tool, GET /agent, GET /provider

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

**Intra-phase dependencies**: All 9 tools are purely additive (no existing code touched). They can be implemented in any order. `opencode_session_children` and `opencode_session_unrevert` depend on sessions having been forked or reverted first, but there is no implementation dependency — each is a standalone API call.

**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Read-only session tools: opencode_session_list, opencode_session_get, opencode_session_status, opencode_session_messages, opencode_session_message (SESSION-01 to SESSION-05)
- [x] 03-02-PLAN.md — Write/mutating session tools: opencode_session_delete, opencode_session_rename, opencode_session_children, opencode_session_unrevert (SESSION-06 to SESSION-09)

---

### Phase 4: Run Options + Structured Responses + Infrastructure

**Goal**: `opencode_run` is the reliable, feature-complete backbone of the Prefect workflow — supporting model/agent/system overrides, async fire-and-forget, structured response surfaces, and a correct timeout that actually cancels in-flight requests.

**Depends on**: Phase 3

**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, SURF-01, SURF-02, INFRA-01, INFRA-02

**Success Criteria** (what must be TRUE):
  1. Claude Code can run a prompt against a specific non-default model by passing `providerID` + `modelID` together (rejected if only one is supplied), and can select a specific agent type per prompt
  2. Claude Code can inject a custom system prompt for a single prompt without affecting the session's persistent configuration
  3. Claude Code can fire a prompt and return immediately without blocking, using `opencode_prompt_async`
  4. `opencode_get_diff` returns a top-level `patch` string field and `opencode_run` returns a structured `parts` array with each part tagged by kind — callers can navigate responses without raw JSON parsing
  5. A timed-out `opencode_run` cancels the in-flight HTTP connection to OpenCode (not just the Promise), preventing orphaned requests
  6. A developer cloning the repo can run `prefect init` to write a correct `.mcp.json` into their project without manual JSON editing

**Intra-phase dependencies**:
  - INFRA-01 (AbortController) must be implemented in the same change as RUN-04 (`opencode_prompt_async`): both touch the timeout/async path in `opencode_run`, and the `noReply` vs `prompt_async` distinction (separate endpoint, 204 void) means the handler needs the full async picture before either is correct.
  - RUN-01/02/03 (body field additions) should be implemented alongside INFRA-01 since all four modify the same `opencode_run` handler block — one atomic change avoids a partially-correct intermediate state.
  - SURF-01 and SURF-02 touch `opencode_get_diff` and the `opencode_run` return shape respectively — independent of the above, can be done before or after.
  - INFRA-02 (`prefect init` CLI) is entirely independent — new file `src/cli.ts` and a `package.json` bin entry. Zero risk of interfering with any other change.

**Plans**: TBD

---

### Phase 5: Advanced Run Options

**Goal**: `opencode_run` exposes the full prompt body surface and sessions support parent/child hierarchies via `parentID`.

**Depends on**: Phase 4

**Requirements**: (v3.0 — TBD when milestone is opened)

**Success Criteria** (what must be TRUE):
  1. Claude Code can attach files to a prompt as context using `FilePartInput`
  2. Claude Code can enable or disable specific tools per prompt using the `tools` map
  3. Claude Code can resume a conversation from a specific message using `messageID`
  4. `opencode_create_session` accepts `parentID` to explicitly model session hierarchies
  5. The package is installable via `npm install -g prefect-mcp` from a published npm registry entry

**Plans**: TBD

---

### Phase 6: Session Utilities + Workspace APIs

**Goal**: Prefect exposes the full remaining OpenCode API surface — session lifecycle utilities, workspace inspection, and experimental tool introspection.

**Depends on**: Phase 5

**Requirements**: (v3.0 — TBD when milestone is opened)

**Success Criteria** (what must be TRUE):
  1. Claude Code can trigger context compaction, generate an AGENTS.md, retrieve the session todo list, run slash commands, and run shell commands within a session context
  2. Claude Code can share and unshare sessions via the share/unshare endpoints
  3. Claude Code can inspect the workspace — LSP symbol search, git VCS state, file status, and configured MCP servers
  4. Claude Code can list available agents and providers/models to validate names before passing them to `opencode_run`

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Server | v1.0 | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | v1.0 | 2/2 | Complete | 2026-04-26 |
| 3. Session Management Tools | v2.0 | 0/2 | Ready | — |
| 4. Run Options + Structured Responses + Infrastructure | v2.0 | 0/? | Not started | — |
| 5. Advanced Run Options | v3.0 | 0/? | Not started | — |
| 6. Session Utilities + Workspace APIs | v3.0 | 0/? | Not started | — |
