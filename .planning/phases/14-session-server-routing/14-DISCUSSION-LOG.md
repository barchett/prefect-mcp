# Phase 14: Session-Server Routing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 14-session-server-routing
**Areas discussed:** Client architecture, Transparent routing scope, ensureOpencodeRunning() design, Stale session error format

---

## Client architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Per-call dynamic client (cache by URL) | Replace global `client` with `getClient(serverUrl)` helper; caches by URL string, creates on first use | ✓ |
| Client pool | Pre-initialize clients for all registered servers | |
| Lazy-initialize per server | Initialize clients lazily but store globally per server name | |

**User's choice:** Per-call dynamic client creation with URL-keyed cache.
**Notes:** "The alternative — trying to maintain a client pool or lazy-initialize per server — is more complex and error-prone. The refactor is mechanical: replace `client.x.y()` with `getClient(serverUrl).x.y()`. One helper function, 40 mechanical substitutions — agent can do it in one pass."

---

## Transparent routing scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 37 non-entry-point tools | Every tool that takes a sessionId looks up sessions.json | ✓ |
| High-value subset | Only prefect_run + session read/write tools | |

**User's choice:** ALL 37 tools.
**Notes:** "Partial routing creates a split-brain problem — some tools route correctly, others silently hit the wrong server. The session→server lookup is cheap (a JSON file read or in-memory map). Don't create a class of tools that 'work differently.' Uniform behavior wins."

---

## ensureOpencodeRunning() design

| Option | Description | Selected |
|--------|-------------|----------|
| Accept ServerEntry param | Pass the full ServerEntry (name, host, port) — use host+port directly | ✓ |
| Accept serverUrl string param | Pass the resolved URL string | |
| Look up registry internally | Function reads registry itself using a server name | |

**User's choice:** Accept `ServerEntry` param (name, host, port).
**Notes:** "The function already has the localhost check logic, just needs to accept which server to start rather than reading BASE_URL globally. Skip auto-start if `host !== 'localhost' && host !== '127.0.0.1'` (same guard as current)."

---

## Stale session error format

| Option | Description | Selected |
|--------|-------------|----------|
| Verbose (sessionId + server name + next actions) | Full context: what failed, why, and two specific next steps | ✓ |
| Minimal | "Stale session {id}: create a new session." | |

**User's choice:** Verbose, include both sessionId and server name+URL.
**Notes:** Exact template specified by user:
```
Session {sessionId} not found on server '{serverName}' ({serverUrl}).
The session may have been deleted or the server restarted.
Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.
```
"Verbose is right here — this is a confusing failure mode and the user needs to know exactly what happened and what to do next."

---

## Claude's Discretion

- `getClient()` cache implementation: Map vs. plain object
- `SessionMap` interface: exported type vs. inline
- Test strategy for stale session detection
