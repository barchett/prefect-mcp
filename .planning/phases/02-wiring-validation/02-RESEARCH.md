# Phase 2: Wiring & Validation — Research

**Researched:** 2026-04-26
**Domain:** Claude Code MCP registration, OpenCode headless server, end-to-end workflow documentation
**Confidence:** HIGH (all key claims verified live against the actual running environment)

---

## Summary

Phase 2 has no new TypeScript code to write. All four deliverables are configuration files and documentation: `.mcp.json` (WIRE-01), `CLAUDE.md` (WIRE-02), `README.md` (WIRE-03), and `examples/test-task.md` (WIRE-04). The MCP server built in Phase 1 is complete, verified, and running. The primary risk in this phase is getting the details exactly right so that a fresh-clone experience works deterministically — wrong path in `.mcp.json`, missing build step in README, or an ambiguous loop description in CLAUDE.md would each produce a silent failure.

The `.mcp.json` project-scoped file is the correct registration mechanism (not `.claude/settings.json`). The exact format has been verified by running `claude mcp add --scope project prefect -- node build/index.js` live and inspecting the output. Claude Code spawns the subprocess with the project root as CWD, so the relative path `build/index.js` works correctly.

OpenCode is already running locally on port 4096 with a vllm provider (Qwen3-Coder-30B). The config lives at `~/.config/opencode/opencode.json` with a placeholder API key in `~/.config/opencode/auth.json`. The health endpoint `GET /global/health` returns `{"healthy":true,"version":"..."}` and can be used as a readiness check in the README.

**Primary recommendation:** Write `.mcp.json` first (WIRE-01), then CLAUDE.md (WIRE-02), then README.md (WIRE-03), then examples/test-task.md (WIRE-04). All four files are independent and can be a single plan wave.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WIRE-01 | `.mcp.json` registers the MCP server as a Node.js stdio subprocess so Claude Code discovers the tools automatically | Exact JSON format verified live; `claude mcp add --scope project` tested and output inspected |
| WIRE-02 | `CLAUDE.md` documents the review/correct loop pattern — create session → run prompt → get diff → run tests → correct or advance | Loop documented from Phase 1 tool set; guard conditions derived from UAT patterns |
| WIRE-03 | `README.md` covers full setup: install deps, configure and run `opencode serve --port 4096` headless, point Claude Code at the MCP server | All commands verified live: opencode serve flags, health endpoint, npm build steps |
| WIRE-04 | An example test task file `examples/test-task.md` provides a scoped real prompt to validate the full loop end-to-end | Validated loop pattern; task design derived from UAT test 2 (PONG-style) plus file write to produce a diff |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MCP registration | Project config file (`.mcp.json`) | — | Claude Code reads `.mcp.json` at session start and spawns the stdio subprocess |
| Tool invocation | MCP server (`build/index.js`) | OpenCode HTTP API | Claude Code → MCP server (stdio) → OpenCode (HTTP) |
| Model execution | OpenCode + vllm backend | — | OpenCode routes prompts to the configured model provider |
| Loop orchestration | `CLAUDE.md` instructions | Claude Code | CLAUDE.md tells Claude Code how to drive the tools |
| Developer setup | `README.md` | — | Human reads README to configure environment once |
| End-to-end validation | `examples/test-task.md` | — | Test task proves the full loop works after setup |

---

## WIRE-01: .mcp.json Registration

### Verified Format

`claude mcp add --scope project prefect -- node build/index.js` was run live in the project root. The resulting `.mcp.json` is:

```json
{
  "mcpServers": {
    "prefect": {
      "type": "stdio",
      "command": "node",
      "args": [
        "build/index.js"
      ],
      "env": {}
    }
  }
}
```

[VERIFIED: live `claude mcp add` execution, inspected output file]

### Key Facts

- **File location:** `.mcp.json` in the project root (not `.claude/settings.json`). [VERIFIED: official Claude Code docs, scope=project]
- **Scope semantics:** `--scope project` creates `.mcp.json` and commits it to the repo so all developers get the registration automatically. `--scope local` (default) stores it in `~/.claude.json` and is NOT shared. [CITED: code.claude.com/docs/en/mcp]
- **CWD when subprocess is spawned:** Claude Code sets CWD to the project root (the directory containing `.mcp.json`). Relative path `build/index.js` works correctly. [VERIFIED: tested with relative path, confirmed by docs]
- **Discovery:** Claude Code reads `.mcp.json` at session start. No restart required once the file exists when a new session opens; an already-running session must be restarted. [CITED: code.claude.com/docs/en/mcp]
- **env field:** Can pass `OPENCODE_URL` and `PREFECT_TIMEOUT_MS` overrides here if needed, but defaults in `src/index.ts` are correct for typical use — leave `env: {}` for default behavior.
- **Build prerequisite:** `build/` is gitignored. The `.mcp.json` registration will fail at session start if `npm run build` has not been run. This must be documented in README.md.

### Env Vars in .mcp.json (optional)

If the user wants a non-default OpenCode URL or timeout, add to the `env` object:

```json
"env": {
  "OPENCODE_URL": "http://192.168.1.4:4096",
  "PREFECT_TIMEOUT_MS": "300000"
}
```

[VERIFIED: src/index.ts reads these env vars]

### WSL Note

This project runs inside WSL2. Claude Code also runs inside WSL2. The subprocess is spawned in the same Linux environment — no `wsl.exe` wrapper needed. The `node` command resolves to `/usr/bin/node` (Node 20.20.0). [VERIFIED: `which node` in WSL]

---

## WIRE-02: CLAUDE.md Loop Documentation

### What CLAUDE.md Must Accomplish

CLAUDE.md is read at session start by Claude Code. For this project, it needs to:
1. Tell Claude Code that a Prefect MCP server is available and what its tools are for.
2. Document the canonical create → run → diff → test → correct loop step-by-step.
3. Define the guard conditions: when to approve_permission vs. fork/revert.
4. State the git contract: all OpenCode work lands in the current working directory, git is the safety net.

### Loop Structure (derived from Phase 1 tool set)

```
1. CREATE SESSION:    opencode_create_session → session_id
2. RUN PROMPT:        opencode_run(session_id, task_prompt) → assistant_message
3. GET DIFF:          opencode_get_diff(session_id) → [FileDiff]
4. REVIEW DIFF:       Inspect what OpenCode changed
5. RUN TESTS:         Use Bash tool to run the project test suite
6. DECISION:
   - Tests pass + diff looks good → git add, git commit, advance
   - Tests fail, diff repairable → opencode_run(session_id, correction_prompt) → repeat from 3
   - Session corrupted / off-rails → opencode_fork(session_id) → new_session_id, restart from 2
   - Single bad message → opencode_revert(session_id, messageID) → restart from 2
   - Give up on this session → discard, git checkout -- . to reset files
7. ABORT IF NEEDED:   opencode_abort(session_id) to stop a runaway session
```

[VERIFIED: all 7 tools confirmed working in Phase 1 UAT]

### Permission Handling

OpenCode's `~/.config/opencode/opencode.json` already has `"permission": { "bash": "allow", "edit": "allow", "write": "allow", "webfetch": "allow" }` set to auto-approve all operations. [VERIFIED: live config file at `~/.config/opencode/opencode.json`]

`opencode_approve_permission` is therefore an **emergency tool** only — used if OpenCode was reconfigured to require permissions. CLAUDE.md should document this but not put it in the primary happy path.

### Tool Reference Table for CLAUDE.md

| Tool | When to Call |
|------|-------------|
| `opencode_create_session` | Once at start of each task |
| `opencode_run` | To send a prompt; waits for completion (up to 120s default) |
| `opencode_get_diff` | After each run to see what changed |
| `opencode_abort` | If opencode_run is taking too long and you want to stop it |
| `opencode_fork` | Session went off-rails — fork gives you a clean copy at a safe point |
| `opencode_revert` | Undo a specific bad message, keep the rest of session history |
| `opencode_approve_permission` | Emergency only — approve a pending permission request |

---

## WIRE-03: README.md Setup Instructions

### Verified Command Set

**1. Prerequisites**
- Node.js >= 18 (verified: Node 20.20.0 at `/usr/bin/node`)
- OpenCode >= 1.14 installed (`~/.opencode/bin/opencode` on this machine)
- Claude Code CLI installed

**2. Install and build the MCP server**
```bash
git clone <repo>
cd supervisor
npm install
npm run build
```

`build/` is gitignored. `npm run build` runs `tsc && chmod 755 build/index.js`. [VERIFIED: package.json, tsconfig.json, .gitignore]

**3. Register with Claude Code (once per clone)**
```bash
claude mcp add --scope project prefect -- node build/index.js
```
This writes `.mcp.json` to the project root. The file is committed in the repo so this step may already be done — run `claude mcp list` to verify.

**4. Install and configure OpenCode**

Install:
```bash
curl -fsSL https://opencode.ai/install | bash
```

Config file at `~/.config/opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vllm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "vLLM (local)",
      "options": {
        "baseURL": "http://<your-vllm-host>:8000/v1"
      },
      "models": {
        "<model-id>": {
          "name": "Your Model"
        }
      }
    }
  },
  "model": "vllm/<model-id>",
  "permission": {
    "bash": "allow",
    "edit": "allow",
    "write": "allow",
    "webfetch": "allow"
  }
}
```

Credentials (placeholder key required even for local models):
```bash
mkdir -p ~/.config/opencode
echo '{"vllm": "dummy"}' > ~/.local/share/opencode/auth.json
```
[VERIFIED: live `~/.config/opencode/auth.json` contains `{"vllm": "dummy"}`]

**5. Start OpenCode headless server**
```bash
opencode serve --port 4096
```

Default hostname is `127.0.0.1`. Default port is `0` (random) so `--port 4096` is required to match the MCP server default `OPENCODE_URL`. [VERIFIED: `opencode serve --help`]

Health check:
```bash
curl http://localhost:4096/global/health
# {"healthy":true,"version":"1.14.26"}
```
[VERIFIED: live curl against running server]

**6. Open Claude Code — tools should appear automatically**
```bash
claude  # open session in project root
/mcp    # verify prefect server status
```

### WSL-Specific Note

WSL2's default NAT networking may prevent `localhost:4096` in WSL from reaching OpenCode running on the Windows host (or vice versa). If OpenCode runs on Windows and the MCP server runs in WSL, use the Windows host's IP instead of `localhost` in `OPENCODE_URL`. If everything runs inside WSL (the typical case here), `localhost` works as expected. [MEDIUM confidence — derived from WSL2 networking docs, not tested cross-boundary]

### opencode serve Flag Reference

[VERIFIED: `opencode serve --help` live output]

| Flag | Default | Purpose |
|------|---------|---------|
| `--port` | 0 (random) | Port to listen on — always specify 4096 |
| `--hostname` | 127.0.0.1 | Bind address |
| `--cors` | [] | Additional CORS origins (not needed for MCP use) |
| `--mdns` | false | mDNS service discovery |
| `--print-logs` | false | Print server logs to stderr |

---

## WIRE-04: examples/test-task.md Design

### What Makes a Good Validation Task

The task must:
1. Produce a **file diff** (so `opencode_get_diff` returns non-empty results — proves the full loop)
2. Be **scoped and deterministic** (simple enough that Qwen3-Coder-30B completes it reliably)
3. Be **self-contained** (work on a file already in the repo, not requiring external dependencies)
4. Produce a **verifiable result** (the diff can be inspected by a human or Claude Code)

The UAT (test 3) revealed that a PONG-only prompt returns an empty diff — because OpenCode didn't write files. The test task must explicitly ask OpenCode to modify a file.

### Recommended Test Task Design

**Target file:** `examples/hello.ts` — a new file that OpenCode creates/modifies. Using a throwaway file in `examples/` avoids risk of corrupting source code.

**Prompt:** "Create a file at `examples/hello.ts` that exports a function `greet(name: string): string` which returns `'Hello, ' + name + '!'`. Add a call at the bottom: `console.log(greet('World'));`"

**Why this works:**
- Deterministic: the output is fully specified
- Produces a real diff: creates a new `.ts` file
- Verifiable: run `node -e "const {greet}=require('./examples/hello.js'); console.log(greet('World'))"` or just read the file
- Simple enough for any model to complete in one shot
- No test runner required — visual inspection of the diff suffices

### Loop Steps to Document in test-task.md

```
1. Run: opencode_create_session → save session_id
2. Run: opencode_run(session_id, "<prompt above>")
3. Run: opencode_get_diff(session_id) → inspect output, confirm examples/hello.ts appears
4. Verify: read examples/hello.ts, confirm it contains greet()
5. Commit: git add examples/hello.ts && git commit -m "test: validate full loop"
6. Done: loop completed, diff in git history
```

### Assertions for "loop worked"

- `opencode_get_diff` returns at least one FileDiff with `file` containing `hello.ts`
- `examples/hello.ts` exists and contains `greet`
- `git log --oneline -1` shows the commit

---

## OpenCode Config Reference (Verified Live)

### Actual Config in Use (`~/.config/opencode/opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vllm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "vLLM (Thor)",
      "options": {
        "baseURL": "http://192.168.1.4:8000/v1"
      },
      "models": {
        "Qwen/Qwen3-Coder-30B-A3B-Instruct": {
          "name": "Qwen3 Coder 30B",
          "contextWindow": 256000,
          "maxTokens": 8192
        }
      }
    }
  },
  "model": "vllm/Qwen/Qwen3-Coder-30B-A3B-Instruct",
  "permission": {
    "bash": "allow",
    "edit": "allow",
    "write": "allow",
    "webfetch": "allow"
  }
}
```

[VERIFIED: read directly from filesystem]

### Auth File (`~/.config/opencode/auth.json`)

```json
{"vllm": "dummy"}
```

Local vllm requires no real API key. OpenCode expects a key entry to exist. [VERIFIED: read directly from filesystem]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP registration | Custom discovery script | `.mcp.json` with `claude mcp add --scope project` | Native Claude Code mechanism — auto-discovers at session start |
| OpenCode process management | Shell wrapper / pm2 | `opencode serve --port 4096` directly | Single command, built-in health endpoint, no daemon needed |
| Loop documentation | Inline comments | `CLAUDE.md` | Claude Code reads it at session start — it's the designated place for instructions |

---

## Common Pitfalls

### Pitfall 1: Using `--scope local` Instead of `--scope project`

**What goes wrong:** `claude mcp add` default scope is `local`, which stores the config in `~/.claude.json` (user-specific). The tools work for the current user but are not committed to the repo and won't work on a fresh clone.
**Why it happens:** The default scope is `local`, not `project`.
**How to avoid:** Always use `--scope project` for this server. Verify with `cat .mcp.json` after running the command.
**Warning signs:** `claude mcp list` shows the server but `.mcp.json` doesn't exist in the project root.

### Pitfall 2: Missing npm run build Before Opening Claude Code

**What goes wrong:** Claude Code tries to spawn `node build/index.js` but `build/` is gitignored and doesn't exist. The MCP server shows as "failed" in `/mcp`.
**Why it happens:** `build/` is gitignored and not committed.
**How to avoid:** README must make `npm install && npm run build` a prerequisite step before opening Claude Code. Consider adding a note in `.mcp.json` comments (JSONC).
**Warning signs:** `/mcp` shows prefect as "failed" or "not connected".

### Pitfall 3: Random Port from opencode serve

**What goes wrong:** `opencode serve` without `--port` binds to a random port (default: 0). The MCP server's default `OPENCODE_URL=http://localhost:4096` doesn't match.
**Why it happens:** Default port is 0 (random), not 4096.
**How to avoid:** Always run `opencode serve --port 4096`. Document this in README.
**Warning signs:** `opencode_create_session` returns a connection refused error.

### Pitfall 4: opencode_get_diff Returns Empty Array

**What goes wrong:** The test task prompt doesn't instruct OpenCode to write files. `opencode_get_diff` returns `[]`. Loop appears to "work" but no diff lands in git.
**Why it happens:** UAT test 2 used "Reply with PONG" — no file writes → empty diff.
**How to avoid:** `examples/test-task.md` must explicitly instruct OpenCode to create a file.
**Warning signs:** `opencode_get_diff` returns `[]` after `opencode_run` succeeds.

### Pitfall 5: CLAUDE.md Instructions Too Vague

**What goes wrong:** CLAUDE.md says "use the Prefect tools" without specifying the exact sequence. Claude Code improvises a different loop, skipping diff review or forking unnecessarily.
**Why it happens:** LLMs follow explicit step sequences better than abstract descriptions.
**How to avoid:** CLAUDE.md should include the numbered sequence (create → run → diff → test → decide) and explicit conditions for fork vs. revert vs. discard.

---

## Architecture: Data Flow

```
Developer                Claude Code (WSL2)           Prefect MCP (node)      OpenCode (WSL2)     vllm (LAN)
   |                           |                              |                     |                  |
   |--- open claude session --->|                              |                     |                  |
   |                           |-- reads .mcp.json            |                     |                  |
   |                           |-- spawns: node build/index.js|                     |                  |
   |                           |                              |                     |                  |
   |--- "run test-task" ------->|                              |                     |                  |
   |                           |-- opencode_create_session -->|                     |                  |
   |                           |                              |-- POST /session ---->|                  |
   |                           |                              |<-- session_id -------|                  |
   |                           |<-- session_id ---------------|                     |                  |
   |                           |                              |                     |                  |
   |                           |-- opencode_run(session_id) ->|                     |                  |
   |                           |                              |-- POST /session/{id}/message -->|       |
   |                           |                              |                     |-- prompt -------->|
   |                           |                              |                     |<-- completion ----|
   |                           |                              |<-- assistant_msg ---|                  |
   |                           |<-- assistant_msg ------------|                     |                  |
   |                           |                              |                     |                  |
   |                           |-- opencode_get_diff -------->|                     |                  |
   |                           |                              |-- GET /session/{id}/diff -->|           |
   |                           |                              |<-- [FileDiff] ------|                  |
   |                           |<-- [FileDiff] ---------------|                     |                  |
   |                           |                              |                     |                  |
   |<-- diff review + commit --|                              |                     |                  |
```

---

## Validation Architecture

> `nyquist_validation: false` in .planning/config.json — this section is SKIPPED.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | MCP server subprocess | ✓ | 20.20.0 | — |
| `npm` | `npm install`, `npm run build` | ✓ | bundled with Node | — |
| `opencode` CLI | `opencode serve` | ✓ | 1.14.26 | — |
| OpenCode HTTP API | All MCP tools | ✓ | running on localhost:4096 | — |
| `claude` CLI | MCP registration | ✓ | running (this session) | — |
| vllm endpoint | opencode model execution | ✓ | http://192.168.1.4:8000/v1 (UAT confirmed) | — |

[VERIFIED: `command -v opencode`, `curl localhost:4096/global/health`, `node --version`]

**No missing dependencies.** All runtime dependencies confirmed available.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.mcp.json` with `command: "node"` and `args: ["build/index.js"]` — relative path resolved from project root | WIRE-01 | LOW — tested live and worked; path was relative in the generated file |
| A2 | WSL2 mirrored networking not required because both Claude Code and OpenCode run inside WSL | WIRE-03 | MEDIUM — if user has OpenCode on Windows side, `localhost` won't reach it; README should note the workaround |
| A3 | OpenCode auto-approves all permissions via `~/.config/opencode/opencode.json` permission settings | WIRE-02 | LOW — verified in live config file |

**Claims A1 and A3 were verified directly.** Claim A2 is [ASSUMED] based on how the current machine is set up.

---

## Open Questions

1. **Should `.mcp.json` be committed to git?**
   - What we know: It contains no secrets (no API keys, just `command: "node"`). Project-scope is designed for sharing.
   - What's unclear: The GitHub MCP install guide suggests `.gitignore`-ing `.mcp.json` when it contains tokens. This one contains none.
   - Recommendation: Commit it. The `env: {}` entry is empty. Document in README that it's intentionally tracked.

2. **Should README include the OpenCode vllm config template?**
   - What we know: The v2 deferred item in REQUIREMENTS.md says "OpenCode config template with Qwen endpoint — useful reference but not blocking v1"
   - What's unclear: Whether to include a partial reference or omit entirely.
   - Recommendation: Include as a commented reference block in README under a "Configuration Reference" section, clearly marked as an example. The user already has working config; this is for documentation completeness.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: live `claude mcp add --scope project` execution] — Exact `.mcp.json` format
- [VERIFIED: `cat ~/.config/opencode/opencode.json`] — OpenCode config structure and provider format
- [VERIFIED: `cat ~/.config/opencode/auth.json`] — Auth.json placeholder key format
- [VERIFIED: `opencode serve --help`] — All serve flags and defaults
- [VERIFIED: `curl http://localhost:4096/global/health`] — Health endpoint response format
- [VERIFIED: `node --version`, `command -v opencode`] — Environment availability

### Secondary (MEDIUM confidence)
- [CITED: code.claude.com/docs/en/mcp] — MCP scope system (`local` vs `project` vs `user`), stdio transport format
- [CITED: opencode.ai/docs/server/] — `opencode serve` command flags and health endpoint documentation
- [CITED: opencode.ai/docs/providers/] — Provider config structure with `npm`, `baseURL`, `models` fields

### Tertiary (LOW confidence)
- WSL2 networking note — derived from WSL2 docs and community guides; not tested cross-boundary in this environment

---

## Metadata

**Confidence breakdown:**
- WIRE-01 (.mcp.json format): HIGH — generated and inspected live
- WIRE-02 (CLAUDE.md content): HIGH — loop derived from verified tool set
- WIRE-03 (README commands): HIGH — all commands verified live
- WIRE-04 (test task design): HIGH — pitfall confirmed from UAT test 3 (empty diff)
- OpenCode config format: HIGH — read from live filesystem

**Research date:** 2026-04-26
**Valid until:** 2026-07-26 (90 days — stable; opencode version pinned at 1.14.26, Claude Code MCP format stable)
