# Phase 6: Auth + Auto-start - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 06-auth-auto-start
**Areas discussed:** Auth header timing, Auto-start scope, Health poll limits, Code organization

---

## Auth Header Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Call-time (env read per request) | Consistent with Phase 5 resolveDirectory() precedent; no MCP server restart needed when credentials change | ✓ |
| Startup-time (baked into client init) | Simpler; credentials set once at server start | |

**User's choice:** Call-time — consistent with resolveDirectory() precedent. No restart required, hot-reloadable, eliminates "why isn't my password working" class of confusion.

---

## Auto-start Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Once per process lifetime (started flag) | Safe — no risk of spawning multiple OpenCode instances; crashes surface as honest tool errors | ✓ |
| On every connection-refused error | Handles crashes automatically but risks spawning multiple instances on slow start or network flakiness | |

**User's choice:** Once per process lifetime with a `started` flag. "Don't try to be too clever with crash recovery." If OpenCode crashes mid-session, that's a tool error — user restarts manually.

---

## Health Poll Limits

| Option | Description | Selected |
|--------|-------------|----------|
| PREFECT_AUTOSTART_TIMEOUT_MS env var (default 30s, 500ms interval) | Consistent with PREFECT_TIMEOUT_MS naming; 30s generous for local process; configurable for slow machines | ✓ |
| Hardcoded constants | Simpler; fewer env vars to document | |

**User's choice:** `PREFECT_AUTOSTART_TIMEOUT_MS` env var, default 30000ms, poll interval 500ms. "30 seconds is generous for a local process start; if OpenCode isn't healthy in 30 seconds something is wrong."

---

## Code Organization

| Option | Description | Selected |
|--------|-------------|----------|
| src/auth.ts + src/autostart.ts | Two new modules for genuinely separate subsystems; easier to read 6 months later; easier to test | ✓ |
| Inline in src/index.ts | Matches all prior phases; no new files | |

**User's choice:** Extract to `src/auth.ts` + `src/autostart.ts`. "608 lines is already past comfortable for a single file. Small modules are easier to test too — and you have 30 tests to maintain."

---

## Claude's Discretion

- Exact error type/code to detect connection-refused
- Whether `ensureOpencodeRunning()` is a per-handler pre-flight or a once-per-first-failure trigger
- Module-scope vs parameter for `autoStartAttempted` flag

## Deferred Ideas

None.
