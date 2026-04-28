---
status: partial
phase: 06-auth-auto-start
source: [06-VERIFICATION.md]
started: 2026-04-28T00:00:00Z
updated: 2026-04-28T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live WSL2 Auto-start Smoke Test

expected: With OpenCode NOT running, call `opencode_run` from Claude Code. `[Prefect] OpenCode not reachable — spawning 'opencode serve --port 4096'` appears in stderr, `[Prefect] OpenCode is healthy at http://localhost:4096` appears in stderr, and the tool call completes successfully (not a connection error).
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
