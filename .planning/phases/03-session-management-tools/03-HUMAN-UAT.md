---
status: partial
phase: 03-session-management-tools
source: [03-VERIFICATION.md]
started: 2026-04-27T13:45:00.000Z
updated: 2026-04-27T13:45:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. opencode_session_list returns real session objects
expected: Calling opencode_session_list (no args) returns a non-empty array of Session objects, each with id, title, directory, and time fields
result: [pending]

### 2. opencode_session_status returns non-empty status map
expected: Calling opencode_session_status (no args) returns a map of sessionID → SessionStatus where at least one entry is present (type: idle, busy, or retry)
result: [pending]

### 3. opencode_session_rename round-trip
expected: Calling opencode_session_rename with a sessionId and new title, then calling opencode_session_get on the same sessionId, shows the updated title in the returned Session object
result: [pending]

### 4. opencode_session_delete tombstones the session
expected: Calling opencode_session_delete with a sessionId returns true, and a subsequent opencode_session_get for that same ID returns an error (404 or similar)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
