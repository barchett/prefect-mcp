---
status: partial
phase: 08-read-only-api-wrappers
source: [08-VERIFICATION.md]
started: 2026-04-28T20:50:00Z
updated: 2026-04-28T20:50:00Z
---

## Current Test

[awaiting human testing — requires running OpenCode instance]

## Tests

### 1. opencode_list_agents live response
expected: Array of objects with `name`, `description` (optional), and `mode` fields; tool does not fall back to an error response
result: [pending]

### 2. opencode_list_providers live response
expected: Array of `{ id, name, models: Array<{ id, name }> }` — models is an array, not a dict; no `release_date` or `env` fields present
result: [pending]

### 3. opencode_find_symbol path relativization
expected: Array of `{ name, kind, path, range }` where `path` is relative to project root (not an absolute `file://` URI) when `OPENCODE_DEFAULT_PROJECT` is set
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
