# CLAUDE.md — Prefect Project Instructions

This project is **Prefect**: a TypeScript MCP server (already built in `build/index.js`) that exposes OpenCode's HTTP API as Claude Code tools. When you (Claude Code) work on a task in this repo, you can delegate the actual file edits to a local model (Qwen via OpenCode) and review/correct the results.

## When to Use the Prefect Tools

Use the prefect tools when:
- The task is a coding task with a clear, scoped change (e.g. "implement function X", "fix bug Y").
- The change is local to this working tree (OpenCode edits files in CWD).
- You want to keep your context window free for high-level orchestration and review.

Do NOT use the prefect tools for:
- Reading or summarizing existing code (use the Read/Grep tools directly — faster, no extra hop).
- Tasks that require multi-file architectural reasoning across the whole repo (do that yourself).
- Tasks where you need to commit your own work (you commit; OpenCode just edits).

## The Canonical Loop

Always follow this exact sequence. Do not improvise step ordering.

1. **CREATE SESSION.** Call `opencode_create_session({title: "<short task name>"})`. Save the returned `id` as your session ID for the rest of the loop. If OpenCode was not started from this project's root, also pass `directory: process.cwd()` (the absolute path) so the session writes files in the right place.
2. **RUN PROMPT.** Call `opencode_run({sessionId, prompt: "<task description>"})`. This blocks until the agent finishes (default timeout 120 seconds; controlled by `PREFECT_TIMEOUT_MS`).
3. **GET DIFF.** Call `opencode_get_diff({sessionId})`. Inspect the returned `FileDiff[]` to see what OpenCode changed.
4. **REVIEW.** Read the diff. Read any modified files yourself if you need more context than the diff shows.
5. **TEST.** Use the Bash tool to run the project's test/build commands (e.g. `npm run build`, `npm test` if it exists, or any task-specific verification). Do NOT delegate this to OpenCode — you run tests, you decide.
6. **DECIDE.** Based on the diff and test results, choose ONE:
   - **Tests pass + diff is good** -> `git add <files> && git commit -m "<message>"`. Done.
   - **Tests fail or diff needs tweaks** -> `opencode_run({sessionId, prompt: "correct: <specific feedback>"})`. Go back to step 3.
   - **Session is off-rails (wrong files touched, model is confused)** -> `opencode_fork({sessionId, messageID: <id of last good message>})` to get a clean copy at a safe point, then go to step 2 with the new session ID.
   - **Single bad message to undo** -> `opencode_revert({sessionId, messageID: <bad message id>})`, then go to step 2.
   - **Give up entirely** -> `git checkout -- .` to reset the working tree; discard the session.
7. **ABORT IF STUCK.** If `opencode_run` is taking too long and you want to stop it before the timeout, call `opencode_abort({sessionId})`.

## Permission Handling

OpenCode's local config (`~/.config/opencode/opencode.json`) has all permissions set to `allow` (`bash`, `edit`, `write`, `webfetch`). This means OpenCode does NOT pause to ask for permission during normal operation.

`opencode_approve_permission` is therefore an **emergency-only tool**. Use it only if:
- OpenCode's config has been changed to require permissions (you'd see a `permissionId` in the run output — pass it as the `permissionId` argument to `opencode_approve_permission`), OR
- You explicitly want to deny a specific operation that did slip through.

The default response is `once`, `always`, or `reject` (NOT `allow`/`deny`/`allow_always` — those are wrong despite some old docs).

## Tool Reference

| Tool | Required Args | When to Call |
|------|---------------|--------------|
| `opencode_create_session` | `{title?: string, directory?: string}` | Once at the start of each task. Pass `directory` if OpenCode wasn't started from this project root. |
| `opencode_run` | `{sessionId, prompt}` | To send a task or correction. Blocks until OpenCode finishes (up to 120s). |
| `opencode_get_diff` | `{sessionId, messageID?}` | After every `opencode_run` to see what changed. |
| `opencode_abort` | `{sessionId}` | Emergency stop — when `opencode_run` is stuck. |
| `opencode_fork` | `{sessionId, messageID?}` | Session went off-rails — fork at a safe point and continue. |
| `opencode_revert` | `{sessionId, messageID, partID?}` | Undo a single bad message. |
| `opencode_approve_permission` | `{sessionId, permissionId, response: 'once' \| 'always' \| 'reject'}` | Emergency only — auto-approve is the default. |

## Git Contract

- All OpenCode work lands in the current working tree. There is no separate sandbox.
- Git is the safety net. If a session produces bad output, `git checkout -- .` resets everything.
- You commit. OpenCode edits files but does NOT commit. You review the diff first.

## Environment

- The MCP server reads `OPENCODE_URL` (default `http://localhost:4096`) and `PREFECT_TIMEOUT_MS` (default `120000`).
- For long-running tasks, set `PREFECT_TIMEOUT_MS` higher in the `env` field of `.mcp.json` and restart Claude Code.
- OpenCode must be running: `opencode serve --port 4096`. Health check: `curl http://localhost:4096/global/health`.

## Validation

For end-to-end validation that the loop works after a fresh setup, see `examples/test-task.md`.
