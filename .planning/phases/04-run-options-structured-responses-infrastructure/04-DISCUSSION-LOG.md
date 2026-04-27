# Phase 4: Run Options + Structured Responses + Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 04-run-options-structured-responses-infrastructure
**Areas discussed:** Patch string source (SURF-01), Parts surface area (SURF-02), prefect init behavior (INFRA-02), prompt_async return value (RUN-04)

---

## Patch string source (SURF-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Compute with `diff` library | Add `diff` + `@types/diff`, use `createPatch(filename, before, after)` per FileDiff entry | ✓ |
| Skip the patch field | Surface before/after clearly, document callers can diff themselves | |
| Use git diff via shell | Write before/after to tmp files, run git diff | |

**User's choice:** `diff` + `@types/diff` library  
**Notes:** User asked which specific library was proposed before selecting. After confirmation that it's the `diff` (jsdiff) package — pure JS, no native bindings, no sub-dependencies, 150k weekly downloads — user confirmed: "edge cases in unified diff output (no newline at end of file, binary files, empty files) are exactly what a well-maintained library handles correctly and exactly what hand-rolled code gets wrong six months later."

---

## Parts surface area (SURF-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Full union — all 12 types | Zod schema for every Part type; callers get `.type` to switch on with all fields per kind | ✓ |
| Curated subset — text, tool, patch, step-start/finish | 5 most useful types; rest pass through with at least `type` field | |
| Type tag only | Inject `type` discriminator, rest is raw passthrough | |

**User's choice:** Full union — all 12 types  
**Notes:** No additional follow-up needed. Discriminator strings already confirmed from SDK types.

---

## prefect init behavior (INFRA-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded template, fail if .mcp.json exists | Write fixed template; exit 1 if file exists | |
| Hardcoded template, overwrite silently | Always write; idempotent but destructive | |
| Prompt for port/URL | Interactive prompts before writing | |
| Merge-not-overwrite (user-clarified) | Read existing .mcp.json, add prefect entry, preserve all other keys | ✓ |

**User's choice:** Merge-not-overwrite  
**Notes:** User rejected presented options, clarified the correct behavior: read and merge into existing `.mcp.json` rather than failing or overwriting the entire file. Further clarified that `--force` should overwrite **only** the `prefect` key in `mcpServers`, not the whole file. Final behavior: no file → create; file exists + no prefect key → merge; file exists + prefect key → exit 1 with `--force` hint; `--force` → overwrite only the prefect key.

---

## prompt_async return value (RUN-04)

| Option | Description | Selected |
|--------|-------------|----------|
| sessionId + accepted: true | Return `{ sessionId, accepted: true }` — structured, no string parsing needed | ✓ |
| Plain confirmation string | Human-readable "Prompt accepted for session <id>" | |
| Nothing — empty success | Empty response, same as 204 | |

**User's choice:** `{ sessionId, accepted: true }`  
**Notes:** No additional follow-up needed.

---

## Claude's Discretion

- `package.json` bin field update strategy
- `src/cli.ts` argument parsing approach (Commander.js vs manual)
- `tsconfig.json` changes for CLI compilation

## Deferred Ideas

None.
