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

- [ ] **Phase 3: Session Management Tools** — `session.list` (GET /session), `session.get` (GET /session/:id), `session.status` (GET /session/status), `session.messages` (GET /session/:id/message, limit/pagination), `session.message` (GET /session/:id/message/:id), `session.delete` (DELETE /session/:id), `session.rename` (PATCH /session/:id), `session.children` (GET /session/:id/children), `session.unrevert` (POST /session/:id/unrevert)
- [ ] **Phase 4: Run Options + Documentation + Infrastructure** — `model`/`providerID+modelID`, `agent`, `system` on `opencode_run`; `prompt_async` (POST /session/:id/prompt_async, replaces noReply); document `patch` field on `opencode_get_diff` response; document `parts` response shape on `opencode_run` (tool calls, results, file edits, step markers); AbortController timeout fix; install script (`curl | bash`); `prefect init` CLI

### 📋 v3.0 Full API Coverage (Planned)

- [ ] **Phase 5: Advanced Run Options** — `tools`, `FilePartInput`, `messageID`, `AgentPartInput`/`SubtaskPartInput` on `opencode_run`; `parentID` on `opencode_create_session`
- [ ] **Phase 6: Session Utilities + Workspace APIs** — `session.summarize` (POST /session/:id/summarize), `session.todo` (GET /session/:id/todo), `session.init` (POST /session/:id/init), `session.command` (POST /session/:id/command), `session.shell` (POST /session/:id/shell), `session.share`/`session.unshare` (POST+DELETE /session/:id/share); GET /find/symbol, GET /vcs, GET /file/status, GET+POST /mcp, GET /experimental/tool/ids, GET /experimental/tool, GET /agent, GET /provider

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Server | v1.0 | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | v1.0 | 2/2 | Complete | 2026-04-26 |
| 3. Session Management Tools | v2.0 | 0/? | Not started | — |
| 4. Run Options + Docs + Infrastructure | v2.0 | 0/? | Not started | — |
| 5. Advanced Run Options | v3.0 | 0/? | Not started | — |
| 6. Session Utilities + Workspace APIs | v3.0 | 0/? | Not started | — |
