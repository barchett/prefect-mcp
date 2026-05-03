import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const CLI = resolve(process.cwd(), 'build/cli.js');
if (!existsSync(CLI)) {
  throw new Error(`Build artifact missing: run 'npm run build' first`);
}

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-cli-'));
}

function runInit(cwd: string, ...args: string[]): { status: number; stderr: string } {
  const res = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: res.status ?? -1, stderr: res.stderr };
}

function runCli(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]):
  { status: number; stdout: string; stderr: string } {
  const res = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env });
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

test('Case 1: creates .mcp.json when none exists', () => {
  const dir = freshTmp();
  try {
    const { status } = runInit(dir, 'init');
    assert.equal(status, 0);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.ok(cfg.mcpServers.prefect);
    assert.equal(cfg.mcpServers.prefect.command, 'node');
    assert.equal(cfg.mcpServers.prefect.type, 'stdio');
    assert.ok(Array.isArray(cfg.mcpServers.prefect.args));
    assert.ok(cfg.mcpServers.prefect.args[0].endsWith('index.js'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Case 2: adds prefect entry, preserves siblings', () => {
  const dir = freshTmp();
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { other: { command: 'sh', args: ['-c', 'echo hi'] } },
    }));
    const { status } = runInit(dir, 'init');
    assert.equal(status, 0);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.ok(cfg.mcpServers.prefect);
    assert.ok(cfg.mcpServers.other);
    assert.equal(cfg.mcpServers.other.command, 'sh');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Case 3: exits 1 when prefect already present without --force', () => {
  const dir = freshTmp();
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { prefect: { command: 'old', args: [] } },
    }));
    const { status, stderr } = runInit(dir, 'init');
    assert.equal(status, 1);
    assert.match(stderr, /--force/);
    // Verify .mcp.json untouched
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.equal(cfg.mcpServers.prefect.command, 'old');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Case 4: --force overwrites only the prefect key', () => {
  const dir = freshTmp();
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        prefect: { command: 'old', args: [] },
        other: { command: 'sh' },
      },
    }));
    const { status } = runInit(dir, 'init', '--force');
    assert.equal(status, 0);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.equal(cfg.mcpServers.prefect.command, 'node');
    assert.equal(cfg.mcpServers.other.command, 'sh');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Root-level non-mcpServers keys are preserved', () => {
  const dir = freshTmp();
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      theme: 'dark',
      mcpServers: { other: { command: 'sh' } },
    }));
    const { status } = runInit(dir, 'init');
    assert.equal(status, 0);
    const cfg = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    assert.equal(cfg.theme, 'dark');
    assert.ok(cfg.mcpServers.prefect);
    assert.ok(cfg.mcpServers.other);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Bogus subcommand exits 1 with usage', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'bogus');
    assert.equal(status, 1);
    assert.match(stderr, /Usage: prefect <subcommand>/);
    assert.match(stderr, /add-server <name> <host> <port> <provider> <model>/);
    assert.match(stderr, /list-servers/);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('add-server creates ~/.config/prefect/servers.json under HOME=tempdir', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'add-server', 'local', 'localhost', '4096', 'vllm', 'qwen3');
    assert.equal(status, 0);
    assert.ok(existsSync(join(dir, '.config', 'prefect', 'servers.json')));
    const reg = JSON.parse(readFileSync(join(dir, '.config', 'prefect', 'servers.json'), 'utf8'));
    assert.deepEqual(reg.servers[0], { name: 'local', host: 'localhost', port: 4096, providerID: 'vllm', modelID: 'qwen3' });
    assert.equal(typeof reg.servers[0].port, 'number');
    assert.match(stderr, /Registered server 'local'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('add-server with missing args prints usage and exits 1', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'add-server', 'local', 'localhost');
    assert.equal(status, 1);
    assert.match(stderr, /Usage: prefect add-server/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('add-server with non-numeric port exits 1', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'add-server', 'local', 'localhost', 'abc', 'vllm', 'qwen3');
    assert.equal(status, 1);
    assert.match(stderr, /invalid port 'abc'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('add-server with out-of-range port exits 1', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'add-server', 'local', 'localhost', '99999', 'vllm', 'qwen3');
    assert.equal(status, 1);
    assert.match(stderr, /invalid port '99999'/);
    assert.match(stderr, /1-65535/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remove-server removes existing entry and exits 0', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    mkdirSync(join(dir, '.config', 'prefect'), { recursive: true });
    writeFileSync(
      join(dir, '.config', 'prefect', 'servers.json'),
      JSON.stringify({ servers: [
        { name: 'local', host: 'h1', port: 4096, providerID: 'vllm', modelID: 'qwen3' },
        { name: 'dev', host: 'h2', port: 5000, providerID: 'ollama', modelID: 'llama3' },
      ] }, null, 2) + '\n',
    );
    const { status, stderr } = runCli(dir, env, 'remove-server', 'local');
    assert.equal(status, 0);
    const reg = JSON.parse(readFileSync(join(dir, '.config', 'prefect', 'servers.json'), 'utf8'));
    assert.equal(reg.servers.length, 1);
    assert.equal(reg.servers[0].name, 'dev');
    assert.match(stderr, /Removed server 'local'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remove-server on missing name exits 1 with clear stderr', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stderr } = runCli(dir, env, 'remove-server', 'nope');
    assert.equal(status, 1);
    assert.match(stderr, /no server named 'nope'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('list-servers prints empty-registry message on stdout', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    const { status, stdout } = runCli(dir, env, 'list-servers');
    assert.equal(status, 0);
    assert.match(stdout, /No servers registered/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('list-servers prints tabular output to stdout when entries exist', () => {
  const dir = freshTmp();
  try {
    const env = { ...process.env, HOME: dir, USERPROFILE: dir };
    mkdirSync(join(dir, '.config', 'prefect'), { recursive: true });
    writeFileSync(
      join(dir, '.config', 'prefect', 'servers.json'),
      JSON.stringify({ servers: [
        { name: 'local', host: 'h1', port: 4096, providerID: 'vllm', modelID: 'qwen3' },
        { name: 'dev', host: 'h2', port: 5000, providerID: 'ollama', modelID: 'llama3' },
      ] }, null, 2) + '\n',
    );
    const { status, stdout } = runCli(dir, env, 'list-servers');
    assert.equal(status, 0);
    assert.match(stdout, /NAME\s+HOST\s+PORT\s+PROVIDER\s+MODEL/);
    assert.ok(stdout.includes('local'));
    assert.ok(stdout.includes('dev'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
