---
phase: 03-session-management-tools
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - src/index.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`src/index.ts` is a 421-line TypeScript MCP server that wraps the OpenCode HTTP API. The original seven CORE tools from phase 2 are unchanged; the new phase-3 work adds nine SESSION tools (SESSION-01 through SESSION-09). The code is structurally consistent and well-commented. No security vulnerabilities or data-loss bugs were found. Three warnings are raised: a `NaN` timeout risk from unguarded `parseInt`, a leaking `setTimeout` handle in the run-with-timeout path, and an empty-string `sessionId` accepted by all tools via zod's default `z.string()`. Three info items cover error serialization quality, a fragile SDK method reference, and a misleading tool description.

---

## Critical Issues

None.

---

## Warnings

### WR-01: `parseInt` on `PREFECT_TIMEOUT_MS` produces `NaN` if the env var is non-numeric

**File:** `src/index.ts:9`
**Issue:** `parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10)` returns `NaN` when `PREFECT_TIMEOUT_MS` is set to a non-numeric string (e.g., `"two minutes"`). `setTimeout(fn, NaN)` is specified by HTML/Node as equivalent to `setTimeout(fn, 0)`, so every `opencode_run` call would time out immediately with the error `"opencode_run timed out after NaN s"` — an extremely confusing failure mode that looks like a connectivity problem rather than a misconfiguration.

**Fix:**
```typescript
const parsed = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10);
const TIMEOUT_MS = Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
```

---

### WR-02: `setTimeout` handle leaks when `opencode_run` completes before the timeout

**File:** `src/index.ts:70-72`
**Issue:** The `timeout` promise is created with a `setTimeout` that is never cleared when the `client.session.prompt` call wins the `Promise.race`. The timer fires ~`TIMEOUT_MS` ms later, calls `reject(...)` on an already-settled promise (a no-op), but keeps the Node.js event loop alive for the full timeout duration. In practice this delays process exit and wastes resources — particularly relevant since MCP servers are long-lived processes that call `opencode_run` repeatedly.

**Fix:**
```typescript
async ({ sessionId, prompt }) => {
  try {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`opencode_run timed out after ${TIMEOUT_MS / 1000}s — check OPENCODE_URL and model endpoint`)),
        TIMEOUT_MS
      );
    });
    const { data, error } = await Promise.race([
      client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: prompt }] },
      }).finally(() => clearTimeout(timeoutHandle)),
      timeout,
    ]);
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
},
```

---

### WR-03: All tools accept empty string as `sessionId` without validation

**File:** `src/index.ts:44, 63, 94, 119, 148, 172, 219, 243, 263, 291, 317, 343, 362, 390`
**Issue:** Zod's `z.string()` allows empty strings by default. If a caller passes `sessionId: ""`, all session-scoped tools will send an empty path segment to the API (e.g., `GET /session//messages`), producing a 404 or routing error with no indication that the client input was malformed. This affects all 14 tools that accept `sessionId`.

**Fix:** Add `.min(1)` to every `sessionId` schema field:
```typescript
sessionId: z.string().min(1).describe('Session ID from opencode_create_session'),
```
Apply this consistently to all tools — it is a one-line change per tool.

---

## Info

### IN-01: `String(err)` in catch blocks loses stack traces and structured error detail

**File:** `src/index.ts:33, 53, 83, 107, 138, 162, 185, 209, 233, 255, 282, 307, 331, 356, 380, 405`
**Issue:** All 16 catch blocks return `String(err)`. For `Error` instances, this produces only `"Error: some message"` — no stack trace, no cause chain. This makes debugging runtime failures significantly harder, especially for intermittent network errors or SDK-level exceptions.

**Fix:**
```typescript
} catch (err) {
  const msg = err instanceof Error
    ? `${err.message}\n${err.stack ?? ''}`
    : String(err);
  return { content: [{ type: 'text', text: msg }], isError: true };
}
```

---

### IN-02: `client.postSessionIdPermissionsPermissionId` is a fragile auto-generated method name

**File:** `src/index.ts:130`
**Issue:** The permission approval tool calls `client.postSessionIdPermissionsPermissionId(...)` — an auto-generated method name from the OpenCode SDK's REST codegen. This name is derived from the HTTP path and HTTP verb, making it brittle: if the SDK re-generates with a different naming convention or the API path changes, this breaks at runtime with a `TypeError: client.postSessionIdPermissionsPermissionId is not a function` rather than a compile error. The comment on line 129 acknowledges the special routing, but does not acknowledge the fragility.

**Fix:** Add a compile-time guard to catch renames early:
```typescript
// Validate the method exists at module load time (fails fast on SDK upgrades)
if (typeof (client as Record<string, unknown>).postSessionIdPermissionsPermissionId !== 'function') {
  throw new Error('SDK API mismatch: postSessionIdPermissionsPermissionId not found — check @opencode-ai/sdk version');
}
```
Alternatively, rely on TypeScript's strict checking and ensure `noImplicitAny` is enabled in `tsconfig.json` so any rename produces a compile error.

---

### IN-03: `opencode_session_children` description is ambiguous about which session role is expected

**File:** `src/index.ts:367`
**Issue:** The description says the `sessionId` parameter "must be a session that was previously forked from." This phrasing implies the session itself must be a fork (a child), when the intent is the opposite: the `sessionId` should be the **parent** session from which forks were made. A caller could misread this and pass a child session ID when they meant to pass the parent.

**Fix:**
```typescript
description: 'Session ID of the **parent** session whose child forks you want to list. Returns an empty array if no forks have been created from this session. Use opencode_fork to create child sessions.',
```

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
