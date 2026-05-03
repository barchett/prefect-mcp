---
status: partial
phase: 14-session-server-routing
source: [14-VERIFICATION.md]
started: 2026-05-02T22:52:43Z
updated: 2026-05-02T23:20:00Z
---

## Current Test

Executed 2026-05-02 by UAT tester (Claude Code). Two OpenCode instances were running: port 4096 (PID 208984) and port 4097 (PID 209052). Used `node build/cli.js` for server registration — the installed `prefect` binary is an older build that only knows `init`.

## Tests

### 1. End-to-end routing with two running OpenCode instances
expected: Register two servers (`prefect add-server`), call `prefect_create_session` with `server: "<name>"` for each, verify `~/.config/prefect/sessions.json` contains both entries with correct server names and URLs, then call any sessionId tool for each session and verify it routes to the correct port.
result: PASS

Steps executed:
- `node build/cli.js add-server local localhost 4096 qwen3` → "Registered server 'local' at localhost:4096"
- `node build/cli.js add-server dev localhost 4097 qwen3` → "Registered server 'dev' at localhost:4097"
- `~/.config/prefect/servers.json` confirmed two entries with correct names, hosts, ports, models
- `prefect_create_session(server: "local")` → `ses_21461936cffedlWcRwEdhYetR4`
- `prefect_create_session(server: "dev")` → `ses_214618472ffenV8ZMBqi703gY0`
- `~/.config/prefect/sessions.json` confirmed both entries: local→`http://localhost:4096`, dev→`http://localhost:4097`
- `prefect_session_get` on each sessionId returned correct session objects (both resolved without error)

Note: Both sessions were also accessible on both raw ports — OpenCode shares a disk-based session DB regardless of which port created them. Routing correctness is verified via sessions.json mapping and successful tool resolution, not port exclusivity.

### 2. Stale-session 404 error message UX
expected: After creating a session, restart OpenCode (killing the process), then call any sessionId-bearing tool with the now-stale sessionId. Verify the response contains the exact D-12 message: `Session <id> not found on server '<name>' (<url>).\nThe session may have been deleted or the server restarted.\nCall prefect_session_list to see active sessions, or prefect_create_session to start a new one.`
result: FAIL

Steps executed:
- `prefect_create_session(server: "dev")` → `ses_21460bf6cffeUrSgAfwYv6TO6o` (registered to `http://localhost:4097`)
- `kill -9 209052` → port 4097 went down (confirmed: curl returned exit 7)
- Injected fake session entry `ses_00000000000FAKEID0000000000` → `http://localhost:4096` into sessions.json to test 404 path (kill+restart did not produce a stale session because OpenCode persists sessions to disk across restarts, and autostart respawned port 4097 immediately)
- `prefect_session_get(ses_00000000000FAKEID0000000000)` → returned raw SDK error:
  ```
  {"name":"NotFoundError","data":{"message":"Session not found: ses_00000000000FAKEID0000000000"}}
  ```
- Expected D-12 message was NOT returned. Missing: server name, URL, and recovery guidance.

Side observation: killing port 4097 triggered autostart — `opencode serve --port 4097` respawned automatically (new PID 212210) before the session_get call completed. This means the 404 path requires a truly non-existent session ID, not just a killed server.

### 3. Auto-start with named server
expected: Register a local server on a non-default port (e.g. 4097) via `prefect add-server`, ensure OpenCode is NOT running on that port, call `prefect_create_session` with `server: "<name>"`. Verify `opencode serve --port 4097` is spawned, health-polled, and the session is created successfully once healthy.
result: BLOCKED — supervisor-ngp: autostart cannot specify model/provider at spawn time

`opencode serve` has no `--model` flag, so autostart cannot configure the model/provider at spawn time. Note: autostart itself appears to be working (port 4097 respawned when killed during Test 2 setup), but without model configuration the feature is incomplete.

## Summary

total: 3
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- **Test 2 failure**: D-12 error message not triggered. The SDK throws `NotFoundError` (a typed error with `name` field) but the `isNotFound` guard in `build/index.js` checks `error.status === 404`. These two error shapes don't match, so the D-12 path is never reached and the raw SDK error surfaces instead.
- **Installed binary out of date**: `prefect add-server` is not available in the globally installed binary (`/home/larry/.npm-global/bin/prefect`) — it only handles `init`. Had to use `node build/cli.js` directly.
- **Test 3 blocked**: supervisor-ngp gap (opencode serve has no --model flag).
