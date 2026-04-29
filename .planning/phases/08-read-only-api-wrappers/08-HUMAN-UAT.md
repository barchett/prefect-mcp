---
status: resolved
phase: 08-read-only-api-wrappers
source: [08-VERIFICATION.md]
started: 2026-04-28T20:50:00Z
updated: 2026-04-28T21:30:00Z
---

## Tests

### 1. opencode_list_agents live response
expected: Array of objects with `name`, `description` (optional), and `mode` fields
result: PASS — 21 agents returned, correct field shape, no builtIn/permission fields

### 2. opencode_list_providers live response
expected: Array of `{ id, name, models: Array<{ id, name }> }`, models is array not dict
result: PASS — array returned, models correctly unwrapped via Object.values, no excluded fields

### 3. opencode_find_symbol path relativization
expected: Relative paths when directory resolved
result: INCONCLUSIVE (not a Prefect bug) — OpenCode returns [] when no LSP server is configured in opencode.json. /find/file works; /find/symbol requires a language server (e.g. typescript-language-server) in the lsp section of opencode.json. Tool implementation is correct; this is an OpenCode configuration dependency.

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0
inconclusive: 1

## Gaps

- opencode_find_symbol requires LSP config in opencode.json — document in tool description (phase 9 doc sweep)
