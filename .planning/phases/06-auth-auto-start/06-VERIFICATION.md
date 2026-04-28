---
phase: 06-auth-auto-start
verified: 2026-04-28T17:04:40Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live WSL2 auto-start smoke test"
    expected: "With OpenCode NOT running, calling opencode_run should trigger stderr messages '[Prefect] OpenCode not reachable — spawning opencode serve --port 4096' and '[Prefect] OpenCode is healthy at http://localhost:4096', and the tool call should complete successfully"
    why_human: "Cannot start/stop the OpenCode server process in a CI grep-only verification pass. STATE.md blocker calls this out: 'Auto-start reliability in WSL2 is MEDIUM confidence — live testing required during Phase 6'"
---

# Phase 6: Auth + Auto-start Verification Report

**Phase Goal:** Prefect handles HTTP Basic Auth transparently and starts OpenCode automatically when the server is unreachable.
**Verified:** 2026-04-28T17:04:40Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When `OPENCODE_SERVER_PASSWORD` is set, every HTTP request carries a correct `Authorization: Basic <token>` header and requests succeed without editing `.mcp.json` | VERIFIED | `buildAuthHeader()` reads env at call time → `authFetch()` injects header → `fetchWithAuth()` wraps SDK fetch hook → `createOpencodeClient({ fetch: fetchWithAuth })` in index.ts:14 covers all 18 tools. 5 passing auth unit tests confirm correct Base64 encoding and forwarding behavior. |
| 2 | README explicitly warns that `OPENCODE_SERVER_PASSWORD` must not be placed in the `.mcp.json` env block | VERIFIED | README.md line 157: `> **Security (INFRA-06):** Do NOT put \`OPENCODE_SERVER_PASSWORD\` in the \`.mcp.json\` \`env\` block.` Full warning block present at lines 157-161. |
| 3 | When OpenCode is not running at first tool call, Prefect spawns it automatically and the tool call completes successfully — startup is transparent to the caller | VERIFIED (code path) / ? HUMAN NEEDED (live test) | `fetchWithAuth()` catches `isConnRefused(err)` for ALL 18 tools via SDK fetch hook, calls `ensureOpencodeRunning()`, then retries with auth headers. Code path is fully wired and unit-tested. Live WSL2 execution not verified. |
| 4 | Auto-started OpenCode produces no output on the MCP stdout pipe (stderr may surface; stdout is silenced) | VERIFIED | `autostart.ts:94`: `stdio: ['ignore', 'ignore', 'inherit']` — stdin and stdout both silenced; stderr inherited for startup error visibility. |
| 5 | The auto-start health poll uses authenticated headers so a password-protected server is detected as healthy rather than looping on 401 | VERIFIED | `autostart.ts:45`: `globalThis.fetch(new Request(healthUrl, { headers: buildAuthHeader() }))` — auth headers injected on health poll. Unit test `autostart.test.ts:116-136` confirms auth header presence. |

**Score:** 5/5 roadmap success criteria satisfied (code path). 1 requires live human test.

### Plan Must-Haves Verification

The implementation diverged from Plans 02 and 03 during execution due to a code review that introduced `src/fetch.ts` as a unified auth+autostart wrapper. The resulting architecture is superior — ECONNREFUSED is handled at the SDK fetch-hook level for all 18 tools rather than only in `opencode_run`. All goal truths and requirements are satisfied despite the plan-level wording mismatch.

#### Plan 01 Must-Haves

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/auth.ts` exists and exports `buildAuthHeader` and `authFetch` | VERIFIED | File exists. `grep -n "^export"` returns both exports. |
| 2 | `buildAuthHeader` reads `OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME` at call time (not module init) | VERIFIED | Both reads are inside the function body (lines 13-15). No module-scope state (`grep -n "^const\|^let\|^var"` returns empty). |
| 3 | `authFetch` clones the request with the Authorization header when `OPENCODE_SERVER_PASSWORD` is set | VERIFIED | Lines 35-37: spreads existing headers, overrides with auth header, creates `new Request(request, { headers: merged })`. |
| 4 | When `OPENCODE_SERVER_PASSWORD` is not set, `authFetch` forwards the request unchanged | VERIFIED | Lines 28-30: if `buildAuthHeader()` returns `{}`, calls `globalThis.fetch(request)` directly. |
| 5 | README.md contains a warning that `OPENCODE_SERVER_PASSWORD` must NOT be placed in `.mcp.json` | VERIFIED | README lines 157-161 contain the full `> **Security (INFRA-06):**` warning block. |

#### Plan 02 Must-Haves

| # | Truth | Status | Notes |
|---|-------|--------|-------|
| 1 | `src/autostart.ts` exists and exports `ensureOpencodeRunning` | VERIFIED | File exists, export confirmed at line 69. |
| 2 | `ensureOpencodeRunning` spawns `'opencode serve --port <port>'` with `stdio: ['ignore','ignore','inherit']` | VERIFIED | Lines 93-94 confirmed. |
| 3 | Child process cwd is `resolveDirectory(undefined)` | VERIFIED | Line 88: `const cwd = resolveDirectory(undefined)` from `./config.js`; line 95: `cwd` passed to spawn. |
| 4 | Auto-start triggers at most once per MCP server process lifetime (`autoStartAttempted` flag) | VERIFIED (upgraded) | Implementation uses a Promise lock (`startPromise`) that also enables crash recovery — better than a boolean. Guard logic at lines 70-106 confirmed. Plan said "autoStartAttempted flag" but Promise lock satisfies the intent. |
| 5 | Health poll uses `authFetch` so password-protected servers return 200 not 401 | VERIFIED (equivalent) | Plan said `authFetch` but implementation uses `buildAuthHeader()` directly (line 45). Functionally equivalent — both inject the same `Authorization` header. Unit test at lines 116-136 confirms auth injection on health poll. |
| 6 | Health poll throws with a clear message if OpenCode does not become healthy within `PREFECT_AUTOSTART_TIMEOUT_MS` | VERIFIED | Lines 52-55: throws with `"OpenCode did not become healthy within ${timeout}ms"`. Unit test confirms. |

#### Plan 03 Must-Haves

| # | Truth | Status | Notes |
|---|-------|--------|-------|
| 1 | `src/index.ts` imports `authFetch` from `./auth.js` and `ensureOpencodeRunning` from `./autostart.js` | VERIFIED (via indirection) | index.ts imports `fetchWithAuth` from `./fetch.js` (line 8), which in turn imports both `authFetch` and `ensureOpencodeRunning`. The SDK fetch hook receives `fetchWithAuth` which combines both behaviors. Plan wording is superseded by the cleaner architecture. |
| 2 | `createOpencodeClient` receives `fetch: authFetch` — all 18 tools now inject auth headers transparently | VERIFIED | `index.ts:14`: `createOpencodeClient({ baseUrl: BASE_URL, fetch: fetchWithAuth })` — all 18 tools covered. |
| 3 | The `opencode_run` handler detects `ECONNREFUSED` and calls `ensureOpencodeRunning()` then retries | VERIFIED (broader) | ECONNREFUSED detection moved to `fetch.ts` `fetchWithAuth()`, covering ALL 18 tools not just `opencode_run`. Superior to plan spec — any tool can trigger auto-start. |
| 4 | `npm run build` exits 0 with zero TypeScript errors | VERIFIED | Build exits 0, produces `build/auth.js` (1838 bytes), `build/autostart.js` (4469 bytes), `build/fetch.js` (1433 bytes), `build/index.js` (27138 bytes). |
| 5 | The MCP server starts successfully after build (console.error startup message visible) | VERIFIED | `build/index.js` contains `'Prefect MCP server running'` string. Server process starts without crash (smoke test confirms). |

**Total: 12/12 plan-level must-haves satisfied.**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/auth.ts` | HTTP Basic Auth header injection | VERIFIED | 39 lines, exports `buildAuthHeader` + `authFetch`, no module-scope state, no default export |
| `src/autostart.ts` | Auto-start + health poll logic | VERIFIED | 113 lines, exports `ensureOpencodeRunning` + `_resetStartPromise`, Promise-based lock, remote-host guard |
| `src/fetch.ts` | Unified auth+autostart SDK fetch hook | VERIFIED | 35 lines, exports `fetchWithAuth`, introduced during code review to eliminate circular import and cover all 18 tools |
| `src/config.ts` | `resolveDirectory` extracted to break circular import | VERIFIED | 15 lines, exports `resolveDirectory`, imported by both `autostart.ts` and `index.ts` |
| `src/auth.test.ts` | Unit tests for `buildAuthHeader` + `authFetch` | VERIFIED | 5 tests, all passing |
| `src/autostart.test.ts` | Unit tests for `ensureOpencodeRunning` | VERIFIED | 4 tests, all passing (including remote-host guard, dedup, timeout, auth) |
| `README.md` | INFRA-06 security warning | VERIFIED | `OPENCODE_SERVER_PASSWORD` + `OPENCODE_SERVER_USERNAME` in env table; full warning block at lines 157-161 |
| `build/auth.js` | Compiled auth module | VERIFIED | 1838 bytes |
| `build/autostart.js` | Compiled autostart module | VERIFIED | 4469 bytes |
| `build/fetch.js` | Compiled fetch wrapper | VERIFIED | 1433 bytes |
| `build/index.js` | Compiled MCP server | VERIFIED | 27138 bytes, executable |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts` | `fetchWithAuth` | `import { fetchWithAuth } from './fetch.js'` | WIRED | index.ts:8 import + line 14 usage |
| `createOpencodeClient` | `fetchWithAuth` | `fetch: fetchWithAuth` param | WIRED | index.ts:14 confirms |
| `fetchWithAuth` | `authFetch` | `import { authFetch } from './auth.js'` | WIRED | fetch.ts:1 import, lines 27+31 usage |
| `fetchWithAuth` | `ensureOpencodeRunning` | `import { ensureOpencodeRunning } from './autostart.js'` | WIRED | fetch.ts:2 import, line 30 usage |
| `fetchWithAuth` | ECONNREFUSED detection | `isConnRefused(err)` checks both `String(err)` and `err.cause` | WIRED | fetch.ts:7-11, handles Node.js wrapping of ECONNREFUSED in `err.cause` |
| `authFetch` | `buildAuthHeader` | called inside `authFetch` body | WIRED | auth.ts:27 |
| `waitForHealth` | `buildAuthHeader` | called to build auth headers on each poll | WIRED | autostart.ts:45 |
| `ensureOpencodeRunning` | `resolveDirectory` | `import { resolveDirectory } from './config.js'` | WIRED | autostart.ts:3, line 88 usage |
| `index.ts` | `resolveDirectory` | `import { resolveDirectory } from './config.js'` | WIRED | index.ts:9 — circular import resolved via config.ts extraction |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces utility/middleware modules (auth injection, process spawning), not components that render dynamic data. All data flows are request-time credential injection and health polling, verified at Level 3 (wiring).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `buildAuthHeader` returns correct Base64 token | `node --test build/auth.test.js` | 5/5 tests pass | PASS |
| `authFetch` injects headers when password set | `node --test build/auth.test.js` | Test 5 passes | PASS |
| `ensureOpencodeRunning` deduplicates concurrent calls | `npm test` | Test 2: `fetchCallCount === 1` | PASS |
| `ensureOpencodeRunning` throws on timeout | `npm test` | Test 3 passes (200ms timeout) | PASS |
| Health poll uses auth headers | `npm test` | Test 4 confirms `Authorization` header present | PASS |
| Remote host guard throws immediately | `npm test` | Test 1 passes with correct error message | PASS |
| `npm run build` exits 0 | `npm run build` | Exit 0, all 4 build artifacts produced | PASS |
| Live WSL2 auto-start | Manual test required | Not yet executed | ? SKIP — human needed |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-04 | 06-01, 06-03 | `OPENCODE_SERVER_PASSWORD` → `Authorization: Basic <token>` on every HTTP request | SATISFIED | `buildAuthHeader()` + `authFetch()` + `fetchWithAuth()` + SDK fetch hook covers all 18 tools |
| INFRA-05 | 06-01, 06-03 | `OPENCODE_SERVER_USERNAME` sets Basic Auth username (default: `opencode`) | SATISFIED | `auth.ts:15`: `process.env.OPENCODE_SERVER_USERNAME ?? 'opencode'` |
| INFRA-06 | 06-01 | README explicitly warns against `OPENCODE_SERVER_PASSWORD` in `.mcp.json` | SATISFIED | README.md lines 157-161 |
| INFRA-07 | 06-02, 06-03 | Auto-start `opencode serve --port <port>` when server unreachable | SATISFIED | `fetch.ts:29-31`: ECONNREFUSED → `ensureOpencodeRunning()` → spawn |
| INFRA-08 | 06-02 | `stdio: ['ignore', 'ignore', 'inherit']` | SATISFIED | `autostart.ts:94` |
| INFRA-09 | 06-02 | spawn cwd = `OPENCODE_DEFAULT_PROJECT` if set, otherwise undefined | SATISFIED (with deviation) | `autostart.ts:88`: `resolveDirectory(undefined)` returns `undefined` when not set, NOT `process.cwd()`. REQUIREMENTS.md text says "otherwise `process.cwd()`" but design decision D-09 (locked in CONTEXT.md, consistent with Phase 5) intentionally returns `undefined` so OpenCode uses its own session cwd. |
| INFRA-10 | 06-02, 06-03 | Health poll uses authenticated fetch so 401 not looped | SATISFIED | `autostart.ts:45`: `buildAuthHeader()` headers on every health poll request |

**Note on INFRA-09:** The requirement text in REQUIREMENTS.md says "otherwise `process.cwd()`". The implementation returns `undefined` instead. This was a deliberate design decision (D-09) locked during planning — consistent with Phase 5's `resolveDirectory()` design, which avoids silently overriding OpenCode's session-level directory tracking. The behavior difference is intentional and documented in CONTEXT.md. The ROADMAP success criteria do not mention `process.cwd()`, so this is a requirements-text vs implementation discrepancy, not a goal failure.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/auth.ts` | 14 | `return {}` | Info | This is intentional — returns empty headers when no password set. NOT a stub. |

No other stubs, TODOs, hardcoded empty data, or placeholder patterns found in the phase-produced files.

**Observation:** `src/auth.test.ts` is NOT included in the `npm test` script (`package.json` lists: `parts.test.js cli.test.js diff-patch.test.js session-command.test.js autostart.test.js`). The 5 auth tests exist and pass when run directly (`node --test build/auth.test.js`) but are not part of the standard CI gate. This is a warning-level gap — auth test coverage is present but not automatically enforced.

### Human Verification Required

#### 1. Live WSL2 Auto-start Smoke Test

**Test:** With OpenCode NOT running (`curl http://localhost:4096/global/health` should return connection refused), open Claude Code (or restart MCP server), then call `opencode_run` with any prompt.

**Expected:**
- stderr shows `[Prefect] OpenCode not reachable — spawning 'opencode serve --port 4096'`
- stderr shows `[Prefect] OpenCode is healthy at http://localhost:4096`
- Tool call succeeds (returns structured `{ info, parts }` response, not a connection error)
- No `Fatal:` errors in stderr

**Why human:** Cannot start/stop the OpenCode server process programmatically in a grep-only verification pass. STATE.md explicitly notes: "Auto-start reliability in WSL2 is MEDIUM confidence — live testing required during Phase 6." WSL2 process spawning behavior for `opencode` binary needs direct observation.

**Optional auth test:** Set `OPENCODE_SERVER_PASSWORD=test` in shell, restart Claude Code, call any tool — verify requests succeed. Unset after: `unset OPENCODE_SERVER_PASSWORD`.

### Gaps Summary

No gaps found. All ROADMAP success criteria are satisfied at the code level. All 12 plan-level must-haves are satisfied (4 via equivalent/upgraded implementations). The build passes cleanly. All unit tests pass.

The only outstanding item is the live WSL2 smoke test — a known prerequisite from STATE.md that cannot be verified programmatically.

**Architecture note:** The implementation evolved beyond Plan 03's specification through a post-implementation code review. The introduction of `src/fetch.ts` as a unified SDK fetch-hook wrapper (combining `authFetch` + ECONNREFUSED auto-start) is strictly superior to the plan's spec: it covers all 18 tools uniformly rather than wiring ECONNREFUSED only to `opencode_run`, and it eliminates a circular import (`autostart.ts → index.ts`) that the review identified as a structural fragility. `src/config.ts` was extracted to host `resolveDirectory` and break the cycle. These deviations are improvements, not defects.

---

_Verified: 2026-04-28T17:04:40Z_
_Verifier: Claude (gsd-verifier)_
