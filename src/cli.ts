#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addServer, removeServer, listServers, readRegistry } from './registry.js';

// Resolve absolute path to build/index.js (the MCP server) from this CLI's
// own location. Both files live side-by-side in the build/ output dir.
const __dirname = dirname(fileURLToPath(import.meta.url));

// DIST-05: detect global vs local install via path-segment check.
// Node resolves symlinks before computing import.meta.url, so __dirname is
// always the real file path inside node_modules/<pkg>/build/ for global installs.
// Normalize backslashes for Windows path support.
const isGlobal = __dirname.replace(/\\/g, '/').includes('/node_modules/');

// Template for the prefect entry written into .mcp.json mcpServers.prefect.
// Global: use the prefect-mcp PATH bin (added as a second bin entry in package.json).
// Local: use node + absolute path so Claude Code can spawn from any cwd.
const PREFECT_ENTRY = isGlobal
  ? {
      type: 'stdio',
      command: 'prefect-mcp',
      args: [],
      env: {},
    } as const
  : {
      type: 'stdio',
      command: 'node',
      args: [resolve(__dirname, 'index.js')],
      env: {},
    } as const;

function updateClaudemdWorkers(cwd: string): void {
  const claudePath = resolve(cwd, 'CLAUDE.md');
  const existing = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : '';
  const { servers } = readRegistry();

  const bullets = servers.map(
    (s) => `- **${s.name}** — ${s.providerID}/${s.modelID}, ${s.host}:${s.port}`
  );
  const sectionContent = bullets.length > 0 ? bullets.join('\n') : '*(no servers registered)*';
  const newSection = `## Available Workers\n\n${sectionContent}\n`;

  const fileLines = existing.split('\n');
  const startIdx = fileLines.findIndex((l) => l.trimEnd() === '## Available Workers');

  let updated: string;
  if (startIdx === -1) {
    // Section absent — append (with separator if file is non-empty)
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    updated = existing + sep + '\n' + newSection;
  } else {
    // Find end of section (next ## heading or EOF)
    const endIdx = fileLines.findIndex((l, i) => i > startIdx && /^## /.test(l));
    const tail = endIdx === -1 ? [] : fileLines.slice(endIdx);
    updated = [
      ...fileLines.slice(0, startIdx),
      ...newSection.split('\n'),
      ...(tail.length > 0 ? ['', ...tail] : []),
    ].join('\n');
  }

  // Normalize: exactly one trailing newline
  writeFileSync(claudePath, updated.trimEnd() + '\n');
}

function usageAndExit(): never {
  console.error(
    'Usage: prefect <subcommand> [options]\n\n' +
    'Subcommands:\n' +
    '  init [--force]                          Write .mcp.json for this project\n' +
    '  add-server <name> <host> <port> <provider> <model>  Register a named OpenCode server\n' +
    '  remove-server <name>                    Remove a named server from the registry\n' +
    '  list-servers                            List all registered servers',
  );
  process.exit(1);
}

function handleAddServer(handlerArgs: string[]): never {
  const [name, host, portStr, providerID, modelID] = handlerArgs;
  if (!name || !host || !portStr || !providerID || !modelID) {
    console.error('Usage: prefect add-server <name> <host> <port> <provider> <model>');
    process.exit(1);
  }
  const port = parseInt(portStr, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(`Error: invalid port '${portStr}' — must be an integer 1-65535`);
    process.exit(1);
  }
  addServer({ name, host, port, providerID, modelID });
  console.error(`Registered server '${name}' at ${host}:${port} (${providerID}/${modelID})`);
  try { updateClaudemdWorkers(process.cwd()); } catch (e) { console.error(`Warning: could not update CLAUDE.md: ${(e as Error).message}`); }
  process.exit(0);
}

function handleRemoveServer(handlerArgs: string[]): never {
  const [name] = handlerArgs;
  if (!name) {
    console.error('Usage: prefect remove-server <name>');
    process.exit(1);
  }
  try {
    removeServer(name);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
  try { updateClaudemdWorkers(process.cwd()); } catch (e) { console.error(`Warning: could not update CLAUDE.md: ${(e as Error).message}`); }
  process.exit(0);
}

function handleListServers(): never {
  listServers();
  process.exit(0);
}

const args = process.argv.slice(2);
const subcommand = args[0];
const force = args.includes('--force');

switch (subcommand) {
  case 'init': {
    const mcpJsonPath = resolve(process.cwd(), '.mcp.json');

    type McpJson = {
      mcpServers?: Record<string, unknown>;
      [key: string]: unknown;
    };

    if (!existsSync(mcpJsonPath)) {
      // Case 1 (D-17): create fresh with only the prefect entry
      const config: McpJson = { mcpServers: { prefect: PREFECT_ENTRY } };
      writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + '\n');
      console.error('Created .mcp.json with prefect entry');
      process.exit(0);
    }

    // Existing .mcp.json — parse, merge, write
    let existing: McpJson;
    try {
      existing = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as McpJson;
    } catch (err) {
      console.error(`Error: failed to parse .mcp.json — ${(err as Error).message}`);
      process.exit(1);
    }

    const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;

    if ('prefect' in servers && !force) {
      // Case 3 (D-17): refuse without --force
      console.error('Error: .mcp.json already contains a prefect entry. Use --force to overwrite.');
      process.exit(1);
    }

    // Case 2 (no prefect key) or Case 4 (--force): set only the prefect key,
    // preserving all other servers and root-level keys.
    servers.prefect = PREFECT_ENTRY;
    existing.mcpServers = servers;
    writeFileSync(mcpJsonPath, JSON.stringify(existing, null, 2) + '\n');
    console.error(force ? 'Updated prefect entry in .mcp.json' : 'Added prefect entry to .mcp.json');
    process.exit(0);
  }
  case 'add-server':
    handleAddServer(args.slice(1));
  case 'remove-server':
    handleRemoveServer(args.slice(1));
  case 'list-servers':
    handleListServers();
  default:
    usageAndExit();
}
