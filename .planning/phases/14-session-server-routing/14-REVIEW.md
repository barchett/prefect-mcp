---
phase: 14-session-server-routing
reviewed: 2026-05-02T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/sessions.ts
  - src/sessions.test.ts
  - src/autostart.ts
  - src/autostart.test.ts
  - src/fetch.ts
  - src/handlers.ts
  - src/index.ts
  - package.json
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase introduces session-server routing: a `sessions.json` persistence layer (`src/sessions.ts`), a multi-server client cache and `resolveServerUrl` fallback chain in `src/index.ts`, and per-server auto-start routing in `src/fetch.ts`. The core design is sound — the read/write primitives in `sessions.ts` are correct, the `ensureOpencodeRunning` deduplication logic is correct, and `fetchWithAuth` correctly clones the request before retry. Test coverage is thorough for the new primitives.

Three warnings stand out. The most impactful is that `prefect_fork` never writes the new session to `sessions.json`, so forked sessions cannot be routed after an MCP restart. Two narrower bugs affect the quality of stale-session error messages and the robustness of corrupt-sessions.json handling.

---

## Warnings

### WR-01: `prefect_fork` does not persist the new session to `sessions.json`

**File:** `src/index.ts:456-473`

**Issue:** When `prefect_fork` succeeds, the OpenCode server returns a new session object in `data`. This new session ID is never written to `sessions.json` via `addSession`. Every other session-creating path (`prefect_create_session`, `prefect_delegate`, `prefect_dispatch`) writes to `sessions.json` immediately after creation. Forked sessions are the exception. After an MCP server restart, any subsequent call using the forked session's ID will miss the `lookupSession` lookup and fall through to the registry/BASE_URL fallback, potentially routing to the wrong OpenCode instance in a multi-server setup.

**Fix:**
```typescript
// After the successful fork response, persist the mapping.
// The forked session lives on the same server as the parent.
if (data && (data as { id?: string }).id) {
  const serverName = serverNameForUrl(serverUrl);
  addSession((data as { id: string }).id, { server: serverName, url: serverUrl });
}
return { content: [{ type: 'text', text: JSON.stringify(data) }] };
```

---

### WR-02: Stale-session error messages may cite the wrong server URL

**File:** `src/index.ts:244`, `src/index.ts:382`, `src/index.ts:1126`

**Issue:** In the stale-session catch paths for `prefect_run`, `prefect_get_diff`, and `prefect_await`, the error message uses:

```typescript
const staleUrl = entry?.url ?? resolveServerUrl();
```

`entry` is `undefined` when the session was never written to `sessions.json` (e.g., it was created before phase 14 shipped, or via an external tool). In that case, `resolveServerUrl()` with no arguments returns the first entry in the registry — which may be a completely different server than where the session actually existed. The error message then tells the user "session not found on server X" where X is unrelated to the actual problem. A cleaner fallback is the URL that was already resolved earlier in the same block.

**Fix:** Use the `serverUrl` already resolved before the API call, rather than re-invoking `resolveServerUrl()` as a fallback:
```typescript
// Replace:
const staleUrl = entry?.url ?? resolveServerUrl();
// With (serverUrl is already in scope):
const staleUrl = entry?.url ?? serverUrl;
```

This applies to the three call sites listed above.

---

### WR-03: Corrupt `sessions.json` causes hard throw in every tool handler

**File:** `src/sessions.ts:17-29`, `src/index.ts:45-66`

**Issue:** `readSessionMap` throws when `sessions.json` exists but contains malformed JSON or a wrong shape. `resolveServerUrl` calls `lookupSession` which calls `readSessionMap` on every tool invocation (for any tool that receives a `sessionId`). If `sessions.json` becomes corrupt — e.g., due to a partial write or manual edit — every tool handler that accepts a `sessionId` will throw before it even attempts an API call. The error propagates up as an unhandled exception inside the `try` block and surfaces as `isError: true` with a message like `could not parse ...`, which obscures the real problem from the caller.

This is distinct from the ENOENT path (which correctly returns `{ sessions: {} }`). A corrupt file should degrade gracefully — falling back to the registry/BASE_URL chain — rather than erroring every call.

**Fix:**
```typescript
export function readSessionMap(sessionsPath: string = SESSIONS_PATH): SessionMap {
  try {
    const parsed = JSON.parse(readFileSync(sessionsPath, 'utf8'));
    if (!parsed || typeof parsed.sessions !== 'object' || Array.isArray(parsed.sessions)) {
      // Malformed — treat as empty rather than throwing, so routing fallback chain applies
      console.error(`[Prefect] Warning: malformed sessions map at ${sessionsPath}, ignoring`);
      return { sessions: {} };
    }
    return parsed as SessionMap;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { sessions: {} };
    // Parse error or I/O error — degrade gracefully
    console.error(`[Prefect] Warning: could not parse ${sessionsPath}: ${(err as Error).message}`);
    return { sessions: {} };
  }
}
```

Note: this changes the behavior tested in `sessions.test.ts` for the malformed/parse-error cases — those tests would need updating to `assert.ok(result.sessions)` instead of `assert.throws(...)`. The write path (`writeSessionMap`) is unaffected.

---

## Info

### IN-01: `resolveServerFromRequest` reads the registry on every outbound fetch

**File:** `src/fetch.ts:29`

**Issue:** `resolveServerFromRequest` calls `readRegistry()` which does a synchronous filesystem read on every outbound HTTP request. All 40 SDK tool calls flow through `fetchWithAuth`, so a busy session generates a registry read per API call. This only fires on the ECONNREFUSED retry path today — but the `readRegistry()` call executes inside `resolveServerFromRequest` which is called unconditionally within the catch block. In a high-volume scenario this is a minor resource concern, but more relevantly it means a corrupt registry file would trigger an uncaught throw inside a catch block, swallowing the original ECONNREFUSED error.

**Fix:** Cache the registry result at the module level with a short TTL, or move the `readRegistry()` call outside the catch and pass `ServerEntry | undefined` as a parameter to `resolveServerFromRequest`. Low priority since the registry read only happens on connection failure today.

---

### IN-02: Port comparison uses `String(s.port)` vs `requestUrl.port` (empty string for default ports)

**File:** `src/fetch.ts:31`

**Issue:** `requestUrl.port` returns an empty string `""` for URLs using the scheme's default port (e.g., `http://localhost/` has port `""`). If a `ServerEntry` had `port: 80`, `String(80) === ""` is `false`, so the registry match silently fails and falls back to the synthesized entry. For the current default of port 4096 this is a non-issue, but it is a latent edge case if any server is registered on port 80 (http default) or 443 (https default).

**Fix:**
```typescript
const requestPort = requestUrl.port || (requestUrl.protocol === 'https:' ? '443' : '80');
const matched = reg.servers.find(
  (s) => s.host === requestUrl.hostname && String(s.port) === requestPort,
);
```

---

### IN-03: Build artifact guard in `sessions.test.ts` fails the entire test runner on missing build

**File:** `src/sessions.test.ts:12-15`

**Issue:** The module-level `existsSync` check throws synchronously at import time if `build/sessions.js` is absent. Node's `--test` runner propagates this as a fatal loader error, killing the entire test suite rather than reporting a single test failure. This differs from the pattern in other test files (e.g., `parts.test.ts`) where failures are isolated to individual `test()` calls.

**Fix:** Move the guard inside the first `test()` body, or replace with a `test.skip` that emits a clear message:
```typescript
test('sessions module build check', () => {
  if (!existsSync(SESSIONS_BUILD)) {
    throw new Error(`Build artifact missing: run 'npm run build' first`);
  }
});
```

---

_Reviewed: 2026-05-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
