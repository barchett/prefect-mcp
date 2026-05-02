---
status: partial
phase: 14-session-server-routing
source: [14-VERIFICATION.md]
started: 2026-05-02T22:52:43Z
updated: 2026-05-02T22:52:43Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end routing with two running OpenCode instances
expected: Register two servers (`prefect add-server`), call `prefect_create_session` with `server: "<name>"` for each, verify `~/.config/prefect/sessions.json` contains both entries with correct server names and URLs, then call any sessionId tool for each session and verify it routes to the correct port.
result: [pending]

### 2. Stale-session 404 error message UX
expected: After creating a session, restart OpenCode (killing the process), then call any sessionId-bearing tool with the now-stale sessionId. Verify the response contains the exact D-12 message: `Session <id> not found on server '<name>' (<url>).\nThe session may have been deleted or the server restarted.\nCall prefect_session_list to see active sessions, or prefect_create_session to start a new one.`
result: [pending]

### 3. Auto-start with named server
expected: Register a local server on a non-default port (e.g. 4097) via `prefect add-server`, ensure OpenCode is NOT running on that port, call `prefect_create_session` with `server: "<name>"`. Verify `opencode serve --port 4097` is spawned, health-polled, and the session is created successfully once healthy.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
