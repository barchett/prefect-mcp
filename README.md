# Prefect

A TypeScript MCP server that exposes OpenCode's headless HTTP API as Claude Code tools. Claude Code orchestrates at the task level (decompose, review, correct) while delegating actual file edits to a local model running in OpenCode. Diffs land in your working tree; you commit when ready.

**Core value:** delegate implementation to a local model, review the diff in Claude Code, ship without context-switching.

## What's in the Box

7 MCP tools wrapping OpenCode's session API:

- `opencode_create_session` — start a new coding session
- `opencode_run` — send a prompt, block until the agent finishes
- `opencode_get_diff` — inspect what OpenCode changed
- `opencode_fork` — fork a session at a safe point (escape hatch for off-rails sessions)
- `opencode_revert` — undo a single bad message
- `opencode_abort` — stop a running session before timeout
- `opencode_approve_permission` — respond to a permission request (emergency only)

Also included:
- Project-scoped Claude Code registration (`.mcp.json`) so any clone of this repo automatically picks up the tools.
- End-to-end validation task (`examples/test-task.md`).

## Prerequisites

- **Node.js >= 18** (tested on Node 20). `node --version` to check.
- **OpenCode CLI >= 1.14**. Install: `curl -fsSL https://opencode.ai/install | bash`. Verify: `opencode --version`.
- **Claude Code CLI**. Verify: `claude --version`.
- A model endpoint OpenCode can talk to (vllm, Ollama, OpenAI-compatible, etc.). Configured in `~/.config/opencode/opencode.json`.

## Setup (Fresh Clone)

### 1. Clone and build the MCP server

```bash
git clone <repo-url>
cd supervisor
npm install
npm run build
```

`npm run build` runs `tsc && chmod 755 build/index.js`. The `build/` directory is gitignored, so this step is REQUIRED on every fresh clone — Claude Code will fail to spawn the MCP server otherwise.

### 2. Verify the project-scoped MCP registration

The repo ships with `.mcp.json` at the project root that registers the MCP server with Claude Code. To confirm it's there:

```bash
cat .mcp.json
```

You should see the `prefect` server configured with `command: "node"` and `args: ["build/index.js"]`. If `.mcp.json` is missing or empty, recreate it with:

```bash
claude mcp add --scope project prefect -- node build/index.js
```

> Use `--scope project`, not `--scope local`. Local scope stores the config in `~/.claude.json` (user-only, not committed); project scope writes `.mcp.json` so all clones get it.

### 3. Configure OpenCode

OpenCode's config lives at `~/.config/opencode/opencode.json`. Example for a local vllm backend:

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
        "<model-id>": { "name": "Your Model" }
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

The `permission: allow` block is intentional — Prefect treats git as the safety net. If you want manual permission prompts, see `opencode_approve_permission` in `CLAUDE.md` (emergency tool).

Auth file (placeholder is required even for local models):

```bash
mkdir -p ~/.local/share/opencode
echo '{"vllm": "dummy"}' > ~/.local/share/opencode/auth.json
```

Adjust the provider key (`vllm`) and path if you use Ollama, OpenAI, etc.

### 4. Start OpenCode headless

Prefect auto-starts OpenCode on the first tool call if it isn't already running, so this step is optional for most setups. Auto-start spawns `opencode serve --port <N>` where `<N>` is the port from `OPENCODE_URL` (default 4096). The process is spawned in `OPENCODE_DEFAULT_PROJECT` if set, otherwise in Prefect's own working directory.

If you prefer to manage the process yourself, start it manually **from your project root** in a dedicated terminal:

```bash
cd /path/to/your-project
opencode serve --port 4096
```

> **Run from your project root, not from `~` or elsewhere.** OpenCode sets the working directory for all sessions to wherever `opencode serve` was launched. Manual start from the wrong directory causes `opencode_run` to create files there.

> **Use `--port 4096`** (or whatever port is in `OPENCODE_URL`). The default OpenCode port is `0` (random).

Health check:

```bash
curl http://localhost:4096/global/health
# {"healthy":true,"version":"1.14.x"}
```

### 5. Open Claude Code

From the project root:

```bash
claude
```

Inside the session, run:

```
/mcp
```

You should see `prefect` listed as connected. If it shows as failed, the most likely causes (in order):
1. `build/index.js` does not exist -> run `npm run build`.
2. `.mcp.json` is malformed or missing -> see step 2 above.
3. `opencode` is not on PATH (auto-start will fail silently) -> verify with `which opencode`.

### 6. Run the validation task

With everything wired up, follow `examples/test-task.md` to confirm the full create -> run -> diff -> commit loop works end-to-end. Success means a new `examples/hello.ts` file lands in your working tree and you can commit it.

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `OPENCODE_URL` | `http://localhost:4096` | Base URL for OpenCode API; port is also used when auto-starting (`opencode serve --port <N>`) |
| `PREFECT_TIMEOUT_MS` | `120000` | Max wait for `opencode_run` to return (ms) |
| `PREFECT_AUTOSTART_TIMEOUT_MS` | `30000` | Max wait for OpenCode to become healthy after auto-start spawn (ms) |
| `OPENCODE_DEFAULT_PROJECT` | _(unset)_ | Working directory passed to `opencode serve` on auto-start; defaults to Prefect's own cwd |
| `OPENCODE_SERVER_PASSWORD` | _(unset)_ | HTTP Basic Auth password for OpenCode server (read at every tool call) |
| `OPENCODE_SERVER_USERNAME` | `opencode` | HTTP Basic Auth username (only used when `OPENCODE_SERVER_PASSWORD` is set) |

> **Security (INFRA-06):** Do NOT put `OPENCODE_SERVER_PASSWORD` in the `.mcp.json` `env` block.
> `.mcp.json` is committed to version control — storing credentials there leaks them.
> Set `OPENCODE_SERVER_PASSWORD` in your shell profile (e.g., `~/.bashrc` or `~/.zshrc`)
> or in a `.env` file that is gitignored. The MCP server reads it at call time from the
> shell environment, not from `.mcp.json`.

To override per-project, edit the `env` field of `.mcp.json`:

```json
"env": {
  "OPENCODE_URL": "http://192.168.x.x:4096",
  "PREFECT_TIMEOUT_MS": "300000"
}
```

## Day-to-Day Use

See `CLAUDE.md` for the canonical create -> run -> diff -> test -> correct loop. Claude Code reads `CLAUDE.md` automatically at session start, so you don't need to repeat the instructions.

## WSL Note

If Claude Code runs inside WSL2 and OpenCode also runs inside WSL2, `localhost:4096` works as expected. If OpenCode is on the Windows host and you're using WSL2 default NAT networking, point `OPENCODE_URL` at the Windows host IP instead of `localhost`.

## Project Layout

```
.
├── src/index.ts         # MCP server (7 tools)
├── build/               # Compiled output (gitignored)
├── .mcp.json            # Project-scoped Claude Code registration
├── CLAUDE.md            # Loop instructions for Claude Code
├── examples/
│   └── test-task.md     # End-to-end validation prompt
├── package.json
└── tsconfig.json
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/mcp` shows prefect as failed | `build/` missing | `npm run build` then restart Claude Code |
| `opencode_create_session` returns connection error | Auto-start failed (opencode not on PATH, or startup exceeded `PREFECT_AUTOSTART_TIMEOUT_MS`) | Check that `opencode` is on PATH; increase `PREFECT_AUTOSTART_TIMEOUT_MS` if slow to start; or start manually: `opencode serve --port 4096` from project root |
| `opencode_get_diff` returns files in wrong directory | OpenCode started from wrong directory | Stop and restart `opencode serve --port 4096` from the project root |
| `opencode_run` times out | Default 120s exceeded | Increase `PREFECT_TIMEOUT_MS` in `.mcp.json` env |
| `opencode_get_diff` returns `[]` | Prompt didn't ask OpenCode to write files | Re-prompt explicitly asking for a file write (see `examples/test-task.md` for a known-good prompt) |
| Tools missing in fresh Claude session | `.mcp.json` not committed or wrong scope | `claude mcp add --scope project prefect -- node build/index.js` |
