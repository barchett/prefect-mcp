// INFRA-02 + INFRA-03: Resolve the target OpenCode project directory.
// Extracted from index.ts to break the circular import:
//   index.ts → fetch.ts → autostart.ts → index.ts (was)
//   index.ts → fetch.ts → autostart.ts → config.ts (now — no cycle)

/**
 * Fallback chain: per-tool param → OPENCODE_DEFAULT_PROJECT env var → undefined.
 * Returns undefined (not process.cwd()) so OpenCode uses its own session-level
 * directory tracking when no explicit directory is provided.
 * process.env is read at call time (not module init) so that changes
 * to OPENCODE_DEFAULT_PROJECT take effect without restarting the MCP server.
 */
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT;
}
