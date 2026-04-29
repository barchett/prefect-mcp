# Phase 9: npm Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 09-npm-distribution
**Areas discussed:** Global install detection, Env var cutover strategy, Version + license, Plan structure

---

## Global Install Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Path-based (import.meta.url) | Compare CLI's resolved path against npm global prefix | ✓ |
| `npm_config_global` env var | Only set during `npm install`, not at runtime | |
| `require.resolve('prefect-mcp')` | ESM incompatible (package is `"type": "module"`) | |
| Manual `--global` flag | Fallback if runtime detection proves unreliable | ✓ (fallback) |

**User's choice:** Research the most reliable ESM idiom before implementing. Likely: compare `dirname(fileURLToPath(import.meta.url))` against `execSync('npm prefix -g')`. Include `--global` flag as fallback if the runtime detection is unreliable.
**Notes:** Package uses `"type": "module"` — `require.resolve()` is not available. Researcher must verify the ESM-compatible approach works reliably.

---

## Env Var Cutover Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Hard cut (rename only) | Break existing configs; require users to update | |
| Soft migration (read both, prefer new, warn on old) | Backward compatible; deprecation warning to stderr | ✓ |

**User's choice:** Soft migration — read both, prefer new name, warn on old name.
**Notes:** Warning: `[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL`. Hard cut breaks existing setups silently. Remove old names in v4.0.

---

## Version + License

| Option | Description | Selected |
|--------|-------------|----------|
| Version 1.0.0 | Keep current; milestone number is internal; public API is stable | ✓ |
| Version 3.0.0 | Match v3.0 milestone | |
| MIT | Standard, permissive, expected for developer tools | ✓ |
| ISC | npm default, slightly more permissive | |

**User's choice:** Version 1.0.0, license MIT.
**Notes:** The v3.0 milestone is an internal tracking concept, not a semver signal. Public API stability justifies 1.0.0.

---

## Plan Structure

| Option | Description | Selected |
|--------|-------------|----------|
| One atomic plan | All renames in one pass | |
| Two plans (code + docs) | Wave 1: code + package.json; Wave 2: docs + publish verification | ✓ |

**User's choice:** Two plans. Code rename + tests + package.json first (verify `npm test` before touching docs). Docs + CLAUDE.md + publish verification second.
**Notes:** Mixing source rename and docs in one plan makes recovery harder if `npm test` fails mid-rename.

---

## Claude's Discretion

- Exact implementation of global install detection (pending researcher recommendation)
- `publishConfig` content
- `description` field wording in package.json
- Which read sites emit the deprecation warning vs silently fall back

## Deferred Ideas

None.
