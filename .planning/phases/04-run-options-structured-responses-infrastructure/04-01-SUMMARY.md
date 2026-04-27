---
phase: 04-run-options-structured-responses-infrastructure
plan: "01"
subsystem: sdk-types
tags:
  - zod
  - sdk-types
  - schemas
  - tdd
dependency_graph:
  requires: []
  provides:
    - src/parts.ts exports PartSchema covering all 12 Part union members
    - ToolStateSchema with inner status discriminator
    - ApiErrorSchema used by RetryPartSchema
  affects:
    - Plan 02 (opencode_run SURF-02) imports PartSchema
    - Plan 03 (opencode_session_command CMD-01) imports PartSchema
tech_stack:
  added:
    - zod discriminatedUnion (z.discriminatedUnion) for both outer Part union and inner ToolState union
    - Node.js built-in test runner (node:test) — zero new dependency
    - npm test script: tsc && node --test build/parts.test.js
  patterns:
    - z.discriminatedUnion('type', [...]) for 12-member Part union
    - z.discriminatedUnion('status', [...]) for 4-member ToolState inner union
    - z.lazy() forward reference for FilePartSchema in ToolStateCompletedSchema.attachments
    - z.unknown() instead of z.any() for SDK unknown-typed fields
key_files:
  created:
    - src/parts.ts
    - src/parts.test.ts
  modified:
    - package.json (added test script)
decisions:
  - "Used z.discriminatedUnion (not z.union) for both Part and ToolState to get better error messages and correct semantics"
  - "FilePartSchema defined before ToolStateCompletedSchema to enable the z.lazy() reference in attachments field"
  - "FilePartSourceSchema defined as its own discriminatedUnion on 'type' (file|symbol) per SDK types"
  - "SubtaskPartSchema defined inline since SDK has no named export for SubtaskPart"
  - "No z.any() or .passthrough() used — strict schema enforcement per threat model T-04-01"
metrics:
  duration: "3m 10s"
  completed_date: "2026-04-27T17:47:24Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 04 Plan 01: Part Union Zod Schemas Summary

**One-liner:** Zod discriminatedUnion schemas for all 12 OpenCode Part types, ToolState (inner status discriminator), and ApiError, verified by 11 Node built-in test runner tests.

## What Was Built

### src/parts.ts — Exports

| Export | Discriminator | Notes |
|--------|---------------|-------|
| `TextPartSchema` | `type: "text"` | synthetic?, ignored?, time? optional |
| `ReasoningPartSchema` | `type: "reasoning"` | time REQUIRED (unlike TextPart) |
| `FilePartSchema` | `type: "file"` | mime REQUIRED, url REQUIRED, source? optional |
| `ToolPartSchema` | `type: "tool"` | callID AND tool both required strings; state: ToolStateSchema |
| `StepStartPartSchema` | `type: "step-start"` | snapshot? optional |
| `StepFinishPartSchema` | `type: "step-finish"` | cost REQUIRED, tokens REQUIRED |
| `SnapshotPartSchema` | `type: "snapshot"` | snapshot required |
| `PatchPartSchema` | `type: "patch"` | hash, files: string[] |
| `AgentPartSchema` | `type: "agent"` | name, source? optional |
| `RetryPartSchema` | `type: "retry"` | error: ApiErrorSchema (NOT plain string) |
| `CompactionPartSchema` | `type: "compaction"` | auto: boolean |
| `SubtaskPartSchema` | `type: "subtask"` | defined inline (no SDK named export) |
| `PartSchema` | outer union on "type" | z.discriminatedUnion over 12 members |
| `ToolStatePendingSchema` | `status: "pending"` | input, raw |
| `ToolStateRunningSchema` | `status: "running"` | input, title?, metadata?, time |
| `ToolStateCompletedSchema` | `status: "completed"` | input, output, title, metadata, time, attachments? |
| `ToolStateErrorSchema` | `status: "error"` | input, error (string), metadata?, time |
| `ToolStateSchema` | inner union on "status" | z.discriminatedUnion('status', [...]) |
| `ApiErrorSchema` | `name: "APIError"` | data: { message, statusCode?, isRetryable, ... } |
| `FilePartSourceSchema` | union on "type" | file \| symbol variants |

### src/parts.test.ts — Test Coverage

11 tests using `node:test` built-in runner:

1. PartSchema parses TextPart
2. PartSchema parses ReasoningPart with required time
3. PartSchema parses FilePart with required mime and url
4. PartSchema parses ToolPart with completed state including required tool field
5. PartSchema parses StepFinishPart with required cost and tokens
6. PartSchema parses RetryPart with ApiError shape
7. PartSchema parses SubtaskPart (inline-only in SDK union)
8. PartSchema parses StepStartPart, SnapshotPart, PatchPart, AgentPart, CompactionPart
9. PartSchema rejects unknown discriminator
10. ToolStateSchema discriminates on status (NOT type)
11. ApiErrorSchema requires name "APIError"

**Result:** 11/11 pass — `npm test` exits 0.

## TDD Gate Compliance

- RED gate: `test(04-01): add failing tests for Part union schemas (RED)` — commit c800ae5
- GREEN gate: `feat(04-01): implement Zod schemas for all 12 Part types in src/parts.ts (GREEN)` — commit 5a61b29
- Task 2 commit: `feat(04-01): add test script and Node built-in test runner for parts schemas` — commit f1ad1cb

## Deviations from Plan

### Minor structural deviation (Rule 2 - correctness)

**FilePartSchema position:** The plan listed FilePartSchema in schema definition order after ReasoningPartSchema. Due to `z.lazy(() => FilePartSchema)` in `ToolStateCompletedSchema.attachments`, FilePartSchema was defined before ToolStateCompletedSchema (which is defined before the individual Part schemas). This ensures the lazy reference resolves correctly at runtime. The export names and discriminator strings are unchanged.

**No other deviations** — all 15 required export names match exactly, all discriminator strings match SDK verbatim, no z.any() or .passthrough() used.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary crossings introduced. This plan adds a pure schema validation module with no I/O or HTTP. Threat model threats T-04-01 (Tampering) mitigated by strict Zod schemas; T-04-02 and T-04-03 accepted per plan.

## Known Stubs

None. This module is complete: all 12 Part schemas implemented, tested, and verified.

## Self-Check: PASSED

- src/parts.ts exists: FOUND
- src/parts.test.ts exists: FOUND
- package.json test script: FOUND
- Commit c800ae5 (RED): FOUND
- Commit 5a61b29 (GREEN): FOUND
- Commit f1ad1cb (task 2): FOUND
- npm test: 11/11 pass
