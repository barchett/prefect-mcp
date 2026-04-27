# Roadmap: Prefect

## Milestones

- ✅ **v1.0 MVP** — Phases 1–2 (shipped 2026-04-26)
- 📋 **v2.0 Session Management** — Phases 3–4 (planned)
- 📋 **v3.0 Full API Coverage** — Phases 5–6 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–2) — SHIPPED 2026-04-26</summary>

- [x] **Phase 1: MCP Server** (3/3 plans) — completed 2026-04-26
- [x] **Phase 2: Wiring & Validation** (2/2 plans) — completed 2026-04-26

Full archive: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 📋 v2.0 Session Management (Planned)

- [ ] **Phase 3: Session Management Tools** — `session.list`, `session.get`, `session.messages`, `session.message`, `session.delete`
- [ ] **Phase 4: Run Options + Infrastructure** — `model`/`providerID+modelID` override, `agent`, `noReply`, `system` on `opencode_run`; AbortController timeout fix; install script; `prefect init` CLI

### 📋 v3.0 Full API Coverage (Planned)

- [ ] **Phase 5: Advanced Run Options** — `tools`, `FilePartInput`, `messageID`, `AgentPartInput`/`SubtaskPartInput` on `opencode_run`; `parentID` on `opencode_create_session`
- [ ] **Phase 6: Workspace Inspection APIs** — `/find/symbol`, `/vcs`, `/file/status`, `/mcp` (GET+POST), `/experimental/tool/ids`, `/experimental/tool`, `/agent`, `/provider`, `/session/:id/todo`, `/session/:id/summarize`

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. MCP Server | v1.0 | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | v1.0 | 2/2 | Complete | 2026-04-26 |
| 3. Session Management Tools | v2.0 | 0/? | Not started | — |
| 4. Run Options + Infrastructure | v2.0 | 0/? | Not started | — |
| 5. Advanced Run Options | v3.0 | 0/? | Not started | — |
| 6. Workspace Inspection APIs | v3.0 | 0/? | Not started | — |
