# Phase 15: Onboarding + Session Reuse - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers three final v5.0 pieces: (1) CLAUDE.md server registry section auto-generated from servers.json so Claude Code can make routing decisions without reading config files, (2) `prefect init` enhanced to surface first-server guidance for new users, and (3) optional `sessionId` on `prefect_delegate`/`prefect_dispatch` for multi-pass session reuse without creating new sessions.

</domain>

<decisions>
## Implementation Decisions

### MULTI-08: CLAUDE.md Server Registry Section

- **D-01:** Auto-generate the `## Available Workers` section on every `prefect add-server` and `prefect remove-server` call. Static docs drift — guaranteed. The CLI already reads servers.json, so writing the section is trivial.
- **D-02:** Section template: `## Available Workers\n- **{name}** — {providerID}/{modelID}, {host}:{port}` — one line per registered server.
- **D-03:** If CLAUDE.md doesn't exist, create it. If it exists, find and replace only the `## Available Workers` section (from the heading to the next `##` or EOF). Preserve all other CLAUDE.md content unchanged.
- **D-04:** The section lives in CLAUDE.md at project root (`process.cwd()` at the time of the add/remove call). This is the same directory behavior as `prefect init`.

### MULTI-09: `prefect init` First-Server Guidance

- **D-05:** Non-interactive — print guidance + the exact command to run. Interactive readline breaks in CI, Docker, non-tty. Pattern: if no servers are registered after writing .mcp.json, print a clear next-step message with the `prefect add-server` command and its arguments.
- **D-06:** No env var pre-population. No model env var exists today; inventing one adds permanent surface area for marginal value. The user who just installed knows their model. Skip pre-population entirely.
- **D-07:** Guidance message to print (when servers.json is empty or absent):
  ```
  No servers registered yet. Register your first OpenCode server:
    prefect add-server <name> <host> <port> <provider> <model>
  Example:
    prefect add-server local localhost 4096 ollama qwen2.5-coder
  ```

### MULTI-10: Optional `sessionId` on Delegate/Dispatch

- **D-08:** When `sessionId` is provided to `prefect_delegate`: skip session creation entirely, run the prompt against the existing session. `model`, `agent`, `system` still pass through to the run step — they are per-prompt overrides, not session-level. `directory` is ignored — the session already has its directory. `title` is ignored entirely — the session is already named.
- **D-09:** When `sessionId` is provided to `prefect_dispatch`: skip session creation, call `promptAsync` on the existing session. Same param pass-through rules as D-08 (`model`/`agent`/`system` apply; `directory`/`title` ignored). Returns `{ sessionId }` as before.
- **D-10:** Tool descriptions must explicitly document which params are session-creation-only vs. run-step params. Callers need to know: `sessionId` → reuse mode (title/directory ignored); no `sessionId` → create mode (server required, title/directory apply).
- **D-11:** When `sessionId` is provided, `server` param is silently ignored — the session's server is already known via sessions.json lookup. No error if both are provided; session routing wins.

### Claude's Discretion

- Where in CLAUDE.md to insert the `## Available Workers` section (after the last section or before EOF — Claude's choice).
- Whether to use a sentinel comment (`<!-- prefect:workers -->`) to reliably locate the section for replacement, or rely on the heading string match.
- Whether `prefect_delegate` with `sessionId` should still return `diff` (yes — diff is fetched from the session after run, regardless of whether we created it).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Implementation to Modify
- `src/cli.ts` — `prefect init` handler and `handleAddServer`/`handleRemoveServer`; both add-server and remove-server must call the CLAUDE.md update function after writing servers.json
- `src/registry.ts` — `addServer()` and `removeServer()` helpers; the CLAUDE.md update can be called from the CLI layer (not registry.ts) to keep registry.ts pure
- `src/index.ts` — `prefect_delegate` and `prefect_dispatch` handler registrations; add `sessionId` to both input schemas and branch on its presence

### Requirements
- `.planning/REQUIREMENTS.md` §MULTI-08 — CLAUDE.md server registry section spec
- `.planning/REQUIREMENTS.md` §MULTI-09 — `prefect init` first-server prompting spec
- `.planning/REQUIREMENTS.md` §MULTI-10 — sessionId reuse on delegate/dispatch spec
- `.planning/ROADMAP.md` §Phase 15 — success criteria (5 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry.ts` — `readRegistry()` returns `{ servers: ServerEntry[] }`; the CLAUDE.md writer reads this to enumerate servers for the section
- `src/cli.ts` `handleAddServer` / `handleRemoveServer` — call sites where CLAUDE.md update should be triggered (after successful write)
- `src/index.ts` `resolveServerUrl(sessionId)` — already handles sessions.json lookup; delegate/dispatch with sessionId just passes the sessionId through to this existing path
- `src/handlers.ts` `createSession()` / `runPrompt()` — delegate/dispatch reuse skips `createSession`, calls `runPrompt` directly with the provided sessionId

### Established Patterns
- CLI output via `console.error()` (stderr) — guidance messages follow the same pattern
- Registry read-at-call-time (no in-process cache) — CLAUDE.md read/write follows same approach
- Error throwing: `throw new Error("descriptive message")` for logic errors

### Integration Points
- `src/cli.ts` `handleAddServer` and `handleRemoveServer`: add CLAUDE.md update call after `addServer()`/`removeServer()` succeeds
- `src/cli.ts` `case 'init'`: print first-server guidance if `readRegistry().servers.length === 0` after writing .mcp.json
- `src/index.ts` delegate handler: add `sessionId?: z.string().optional()` to inputSchema; branch at top of handler

</code_context>

<specifics>
## Specific Ideas

- CLAUDE.md section template (exact): `## Available Workers\n- **{name}** — {providerID}/{modelID}, {host}:{port}` — one bullet per server, alphabetical or registry order (registry order preferred — preserves user's intentional ordering).
- Sentinel for section replacement: use the heading `## Available Workers` as the marker. Find the line, replace to the next `##` or EOF. A sentinel comment is optional — heading match is sufficient and avoids invisible markup in CLAUDE.md.
- `prefect init` guidance only fires when registry is empty — if the user already has servers registered, `prefect init` stays silent (no guidance spam on re-runs).
- For `prefect_delegate` with sessionId, the response shape stays identical: `{ sessionId, result, diff }` — same return whether the session was created or reused. The diff reflects changes made by the reuse run, not the full session history.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 15-onboarding-session-reuse*
*Context gathered: 2026-05-02*
