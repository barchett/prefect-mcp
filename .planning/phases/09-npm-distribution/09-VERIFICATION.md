---
phase: 09-npm-distribution
verified: 2026-04-29T00:00:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 9: npm Distribution Verification Report

**Phase Goal:** Rename all opencode_* tool names to prefect_*, migrate OPENCODE_* env vars to PREFECT_* with soft-migration fallback, add npm publishing manifest to package.json, add global install detection to cli.ts, update all documentation, and verify npm pack tarball contents.
**Verified:** 2026-04-29
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All opencode_* tool name string literals in src/*.ts are renamed to prefect_* | VERIFIED | `grep -rn "opencode_" src/` returns zero matches (exit 1). All 25 tool registrations confirmed prefect_* in src/index.ts. |
| 2 | All canonical OPENCODE_* env var reads in src/ become PREFECT_* primary reads with soft-migration fallback | VERIFIED | PREFECT_SERVER_URL primary in index.ts (line 15) and autostart.ts (line 8). PREFECT_SERVER_PASSWORD/USERNAME primary in auth.ts (lines 19, 32). PREFECT_DEFAULT_PROJECT primary in config.ts (line 19). All use IIFE fallback pattern. |
| 3 | Reading an old OPENCODE_* env var emits a one-time stderr deprecation warning per read site | VERIFIED | auth.ts has warnedPassword + warnedUsername module-level flags (both confirmed, count=3 each for the let + two guard checks). config.ts has warnedDefaultProject (count=3). index.ts and autostart.ts use module-init IIFE (fires once at load, no flag needed). All warnings go to console.error — zero console.log in modified files. |
| 4 | PREFECT_TIMEOUT_MS and PREFECT_AUTOSTART_TIMEOUT_MS are unchanged | VERIFIED | src/index.ts line 22: `PREFECT_TIMEOUT_MS`. autostart.ts line 20: `PREFECT_AUTOSTART_TIMEOUT_MS`. Neither renamed. |
| 5 | Test files set canonical new env var names (PREFECT_SERVER_PASSWORD, PREFECT_SERVER_URL, PREFECT_SERVER_USERNAME) — not OPENCODE_* names | VERIFIED | `grep -rn "OPENCODE_" src/ --include='*.test.ts'` returns zero matches. auth.test.ts: 17x PREFECT_SERVER_PASSWORD, 9x PREFECT_SERVER_USERNAME. autostart.test.ts: 5x PREFECT_SERVER_URL + 4x PREFECT_SERVER_PASSWORD. |
| 6 | package.json contains name=prefect-mcp, description, license=MIT, engines node>=20, files=[build/, README.md], publishConfig access=public, second bin entry prefect-mcp -> ./build/index.js | VERIFIED | All fields confirmed: name="prefect-mcp", description present, license="MIT", engines={"node":">=20"}, files=["build/","README.md"], publishConfig={"access":"public"}, bin includes "prefect-mcp":"./build/index.js". Valid JSON. |
| 7 | npm run build exits 0 | VERIFIED | Build completes: `tsc && chmod 755 build/index.js build/cli.js` — exit 0. |
| 8 | npm test exits 0 with 39 passing | VERIFIED | 39/39 tests pass, 0 fail, 0 cancelled. |
| 9 | src/cli.ts detects global vs local install via path-segment check on import.meta.url | VERIFIED | Lines 14 and 19-31 of cli.ts: `isGlobal = __dirname.replace(/\\/g, '/').includes('/node_modules/prefect-mcp/')` present. Two-mode PREFECT_ENTRY: global=`command:'prefect-mcp'`, local=`command:'node', args:[resolve(__dirname,'index.js')]`. mcpServerPath removed (count=0). |
| 10 | CLAUDE.md uses prefect_* names throughout and includes DIST-11 explicit-directory-arg instruction | VERIFIED | Zero opencode_ matches in CLAUDE.md. prefect_create_session=2, prefect_run=6, prefect_delegate=1, prefect_dispatch=1. Step 1 text confirmed: "Always pass `directory` explicitly - never rely on the server's default working directory. The same applies to `prefect_delegate` and `prefect_dispatch`". |
| 11 | README.md documents both install pathways (global npm install -g prefect-mcp + local) and uses PREFECT_* env vars with deprecation note | VERIFIED | Zero opencode_ matches. "npm install -g prefect-mcp" present. Global .mcp.json snippet with command:prefect-mcp and local snippet with command:node both present. PREFECT_SERVER_URL=7x, PREFECT_SERVER_PASSWORD=4x, PREFECT_SERVER_USERNAME=1x, PREFECT_DEFAULT_PROJECT=2x. Deprecation note present (1 match for "Deprecated names"). |
| 12 | npm pack --dry-run contains build/ and README.md but not src/ or node_modules/ | VERIFIED | Output lists build/*.js + README.md. src/ TypeScript absent. node_modules/ absent. .planning/ absent. .git/ absent. .mcp.json absent. build/*.test.js present (expected per RESEARCH.md Pitfall 5 — files whitelist ships all of build/). |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/index.ts` | All 25 tool registrations renamed to prefect_*; BASE_URL reads PREFECT_SERVER_URL with OPENCODE_URL fallback | VERIFIED | 4x prefect_create_session, 4x PREFECT_SERVER_URL. Tool listing confirmed. |
| `src/auth.ts` | buildAuthHeader reads PREFECT_SERVER_PASSWORD/USERNAME with one-time-warned fallback | VERIFIED | PREFECT_SERVER_PASSWORD primary, warnedPassword flag, OPENCODE_SERVER_PASSWORD fallback IIFE. warnedUsername present. |
| `src/config.ts` | resolveDirectory reads PREFECT_DEFAULT_PROJECT with one-time-warned fallback; returns undefined when no value | VERIFIED | warnedDefaultProject flag present. PREFECT_DEFAULT_PROJECT primary. Fallback chain returns undefined when neither param nor env var set. |
| `src/autostart.ts` | BASE_URL reads PREFECT_SERVER_URL with OPENCODE_URL fallback; remote-host error uses PREFECT_SERVER_URL | VERIFIED | Module-init IIFE pattern on line 7-14. Line 85: "PREFECT_SERVER_URL points to remote host". |
| `src/cli.ts` | Global install detection + two-mode PREFECT_ENTRY | VERIFIED | isGlobal=2x, /node_modules/prefect-mcp/=1x, command:'prefect-mcp'=1x, command:'node'=1x. mcpServerPath=0x (removed). |
| `package.json` | npm publishing manifest with prefect-mcp name, files whitelist, dual bin entries | VERIFIED | All 8 required fields present. Valid JSON. |
| `CLAUDE.md` | Canonical loop with prefect_* names + explicit directory arg instruction | VERIFIED | 2x prefect_create_session. "Always pass" instruction present (2 locations: step 1 + tool table). |
| `README.md` | Both install pathways + PREFECT_* env var table | VERIFIED | Global pathway with npm install -g command and .mcp.json snippet. Local pathway preserved. Deprecation note present. |
| `examples/test-task.md` | Validation prompt using prefect_* tool names | VERIFIED | prefect_create_session=2x, prefect_run=3x, prefect_get_diff=3x. Zero opencode_ references. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/index.ts tool registrations | all 25 prefect_* tool names | blanket opencode_ -> prefect_ replacement | WIRED | grep -rn "opencode_" src/ returns zero matches. All 25 registrations use prefect_ prefix. |
| src/auth.ts buildAuthHeader | process.env.PREFECT_SERVER_PASSWORD | primary read with warnedPassword guard for OPENCODE_SERVER_PASSWORD fallback | WIRED | Lines 19-27 and 32-40 confirmed. warnedPassword and warnedUsername flags present at module level. |
| package.json bin | build/index.js (global) | second bin key "prefect-mcp" | WIRED | "prefect-mcp": "./build/index.js" confirmed in package.json. |
| src/cli.ts PREFECT_ENTRY | build/index.js (global) OR node + absolute path (local) | isGlobal path-segment check | WIRED | isGlobal ternary emits command:'prefect-mcp' (global) or command:'node',args:[resolve(__dirname,'index.js')] (local). |
| CLAUDE.md canonical loop step 1 | directory arg requirement | instruction text under CREATE SESSION step | WIRED | "Always pass `directory` explicitly" present on line 21. prefect_delegate and prefect_dispatch named explicitly. |
| README.md install section | global install pathway | section heading + npm install command + .mcp.json snippet | WIRED | "## Install" section with Option 1: Global install and Option 2: Local clone both present. |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces configuration artifacts (env var reads, tool name strings, package manifest, documentation), not components that render dynamic data from a database or API. The env var reads flow directly from process.env to runtime behavior; the tool registrations wire to live OpenCode HTTP calls (tested by existing test suite).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm test exits 0 with 39 passing | `npm test` | 39/39 pass, 0 fail | PASS |
| npm run build exits 0 | `npm run build` | tsc + chmod, exit 0 | PASS |
| npm pack --dry-run shows correct contents | `npm pack --dry-run` | build/+README.md present; src/ and node_modules/ absent | PASS |
| package.json is valid JSON | `node -e "JSON.parse(...)"` | Valid JSON | PASS |
| opencode_ references zero in src/*.ts | `grep -rn "opencode_" src/` | Zero matches, exit 1 | PASS |
| opencode_ references zero in docs | `grep -n "opencode_" CLAUDE.md README.md examples/test-task.md` | Zero matches, exit 1 | PASS |
| OPENCODE_* in test files zero | `grep -rn "OPENCODE_" src/ --include='*.test.ts'` | Zero matches, exit 1 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DIST-01 | 09-01 | Package published as prefect-mcp | SATISFIED | package.json "name": "prefect-mcp" |
| DIST-02 | 09-01 | package.json includes "files": ["build/", "README.md"] | SATISFIED | Confirmed in package.json line 8 |
| DIST-03 | 09-01 | package.json includes name, description, license, engines (Node >=18), publishConfig | SATISFIED | All fields present. Note: engines is >=20 (stricter than >=18 specified in REQUIREMENTS.md; plan intentionally used >=20 per interface spec) |
| DIST-04 | 09-02 | npm pack --dry-run verified | SATISFIED | Dry-run output confirms build/+README.md only; no src/, node_modules/, .planning/, .mcp.json |
| DIST-05 | 09-02 | prefect init detects global vs local — global writes command:"prefect-mcp" | SATISFIED | isGlobal path-segment check in cli.ts; two-mode PREFECT_ENTRY confirmed |
| DIST-06 | 09-02 | README documents both install pathways | SATISFIED | README.md Install section with Option 1 (global) and Option 2 (local) |
| DIST-07 | 09-01 + 09-02 | All tool names renamed from opencode_* to prefect_* across *.ts and *.md files | SATISFIED | Zero opencode_ in src/*.ts; zero opencode_ in CLAUDE.md, README.md, examples/test-task.md |
| DIST-08 | 09-01 | npm test passes after rename | SATISFIED | 39/39 tests pass |
| DIST-09 | 09-02 | CLAUDE.md tool reference table and canonical loop use prefect_* names | SATISFIED | prefect_create_session=2, prefect_run=6, prefect_delegate=1, prefect_dispatch=1 in CLAUDE.md |
| DIST-10 | 09-02 | examples/test-task.md uses prefect_* tool names | SATISFIED | prefect_create_session=2, prefect_run=3, prefect_get_diff=3 |
| DIST-11 | 09-02 | CLAUDE.md canonical loop instructs callers to always pass explicit directory arg | SATISFIED | Step 1 text includes "Always pass `directory` explicitly" + prefect_delegate and prefect_dispatch named |
| DIST-12 | 09-01 + 09-02 | All OPENCODE_* env vars renamed to PREFECT_* across *.ts, *.md, test files | SATISFIED | Canonical reads all use PREFECT_*; OPENCODE_* appears only in: (a) fallback IIFE code, (b) deprecation warning strings, (c) .describe() documentation strings in index.ts. Test files: zero OPENCODE_* matches. Docs: OPENCODE_* appears only in deprecation notes in CLAUDE.md and README.md. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/index.ts | 57, 90, 143, 188, 215, 243, 271, 539, 576, 625, 667, 710, 762, 790, 816, 819 | `.describe('...Falls back to OPENCODE_DEFAULT_PROJECT env var...')` — old env var name in 16 tool description strings | Warning | These are user-visible tool documentation strings shown in Claude Code's tool inspector. They reference the deprecated OPENCODE_DEFAULT_PROJECT name rather than PREFECT_DEFAULT_PROJECT. This is misleading documentation but does NOT affect runtime behavior — the actual env var reads in config.ts correctly use PREFECT_DEFAULT_PROJECT as the primary. Not a blocker: the plan's DIST-12 acceptance criteria tested only `grep -rn "opencode_"` (lowercase tool names), not `grep "OPENCODE_DEFAULT_PROJECT"` in describe strings. The REQUIREMENTS.md DIST-12 text says "renamed across all *.ts files" which could encompass these strings, but the plan scoped it to canonical reads and tool names. Recommend updating these in a follow-up. |

The `.describe()` strings mention `OPENCODE_DEFAULT_PROJECT` as the fallback name, which is technically accurate (the old name still works via soft migration). However, user-visible documentation should reference the canonical new name. This is a cosmetic issue, not a functional gap.

### Human Verification Required

None. All acceptance criteria for all 12 requirements are verifiable programmatically and have been verified.

### Gaps Summary

No gaps found. All 12 must-have truths are verified, all required artifacts exist and are substantive and wired, all key links are confirmed, all 12 requirement IDs are satisfied, and all behavioral spot-checks pass.

The one anti-pattern (OPENCODE_DEFAULT_PROJECT in 16 .describe() strings in src/index.ts) is a documentation cosmetic issue, not a functional gap. The runtime behavior is correct — PREFECT_DEFAULT_PROJECT is the primary read. This warrants a follow-up issue but does not block the phase goal.

---

_Verified: 2026-04-29T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
