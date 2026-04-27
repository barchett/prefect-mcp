# Requirements: Prefect v2.0

**Milestone:** v2.0 session-management
**Status:** Active
**Last updated:** 2026-04-26

---

## v2.0 Requirements

### Session Management

- [ ] **SESSION-01**: Claude Code can list all active sessions (`session.list` → GET /session)
- [ ] **SESSION-02**: Claude Code can fetch a single session by ID (`session.get` → GET /session/:id)
- [ ] **SESSION-03**: Claude Code can check global session status (`session.status` → GET /session/status)
- [ ] **SESSION-04**: Claude Code can retrieve a session's message history with optional limit/pagination (`session.messages` → GET /session/:id/message)
- [ ] **SESSION-05**: Claude Code can fetch a single message by ID within a session (`session.message` → GET /session/:id/message/:id)
- [ ] **SESSION-06**: Claude Code can delete a session (`session.delete` → DELETE /session/:id)
- [ ] **SESSION-07**: Claude Code can rename a session (`session.rename` → PATCH /session/:id)
- [ ] **SESSION-08**: Claude Code can list child sessions of a forked session (`session.children` → GET /session/:id/children)
- [ ] **SESSION-09**: Claude Code can unrevert a session to undo a revert (`session.unrevert` → POST /session/:id/unrevert)

### Run Options

- [ ] **RUN-01**: `opencode_run` accepts `model` override (`providerID` + `modelID` pair — both required together, reject if only one is provided) to select a non-default model for a single prompt
- [ ] **RUN-02**: `opencode_run` accepts `agent` to select a specific agent type for a single prompt
- [ ] **RUN-03**: `opencode_run` accepts `system` to inject a custom system prompt override for a single prompt
- [ ] **RUN-04**: New `opencode_prompt_async` tool sends a prompt and returns immediately (204) — uses POST /session/:id/prompt_async; this is a separate endpoint, not the `noReply` body field on the synchronous prompt endpoint

### Structured Response Surfacing

- [ ] **SURF-01**: `opencode_get_diff` surfaces `patch` as a top-level string field in its response (not buried in raw JSON)
- [ ] **SURF-02**: `opencode_run` returns parts as a structured typed array — each part tagged by kind (text, tool_call, tool_result, file_edit, step) so callers can navigate without parsing raw JSON
  - **Planner note:** Verify the exact part type discriminator strings (tag names and values) from the OpenCode SDK types (`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`) or from GET /doc before writing Zod schemas. Getting these wrong is the same class of bug as the `once`/`always`/`reject` permission enum in v1.

### Infrastructure

- [ ] **INFRA-01**: `opencode_run` and `opencode_prompt_async` use AbortController + fetch `signal` instead of `Promise.race` — cancels the in-flight TCP connection on timeout rather than orphaning it
- [ ] **INFRA-02**: `prefect init` CLI writes a correctly-configured `.mcp.json` into the current working directory

---

## Future Requirements

### v3.0 targets (deferred)

- `opencode_run` tools override (enable/disable per prompt)
- `opencode_run` FilePartInput (file attachments as context)
- `opencode_run` messageID (reply to a specific message)
- `opencode_run` AgentPartInput / SubtaskPartInput
- `opencode_create_session` parentID (session hierarchies)
- Install script: `npm install -g prefect-mcp` (requires npm publish)
- session.summarize, session.todo, session.init, session.command, session.shell, session.share/unshare
- GET /find/symbol, GET /vcs, GET /file/status, GET+POST /mcp
- GET /experimental/tool/ids, GET /experimental/tool, GET /agent, GET /provider

---

## Out of Scope

- npm packaging / shareable library — personal use tool for now (npm publish deferred to v3)
- Permission loop (SSE + concurrent HTTP) — OpenCode auto-approves trusted ops; git is the safety net
- Multi-user or team config — single machine, single developer
- `noReply` body field on opencode_run synchronous endpoint — superseded by `prompt_async` (separate endpoint)

---

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| SESSION-01–09 | Phase 3 | — |
| RUN-01–04 | Phase 4 | — |
| SURF-01–02 | Phase 4 | — |
| INFRA-01–02 | Phase 4 | — |
