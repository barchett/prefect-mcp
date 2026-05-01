import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface ServerEntry {
  name: string;
  host: string;
  port: number;
  model: string;
}

export interface Registry {
  servers: ServerEntry[];
}

const REGISTRY_DIR = join(homedir(), '.config', 'prefect');
export const REGISTRY_PATH = join(REGISTRY_DIR, 'servers.json');

export function readRegistry(registryPath: string = REGISTRY_PATH): Registry {
  if (!existsSync(registryPath)) return { servers: [] };
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
  } catch (err) {
    console.error(`Error: could not parse ${registryPath} — ${(err as Error).message}`);
    process.exit(1);
  }
}

export function writeRegistry(reg: Registry, registryPath: string = REGISTRY_PATH): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
}

export function addServer(entry: ServerEntry, registryPath: string = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const existing = reg.servers.findIndex((s) => s.name === entry.name);
  if (existing !== -1) {
    console.error(`Updated existing server '${entry.name}'.`);
    reg.servers[existing] = entry;
  } else {
    reg.servers.push(entry);
  }
  writeRegistry(reg, registryPath);
}

export function removeServer(name: string, registryPath: string = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const before = reg.servers.length;
  reg.servers = reg.servers.filter((s) => s.name !== name);
  if (reg.servers.length === before) {
    console.error(`Error: no server named '${name}' in registry.`);
    process.exit(1);
  }
  writeRegistry(reg, registryPath);
  console.error(`Removed server '${name}'.`);
}

export function listServers(registryPath: string = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  if (reg.servers.length === 0) {
    console.log('No servers registered. Use: prefect add-server <name> <host> <port> <model>');
    return;
  }
  console.log('NAME            HOST            PORT   MODEL');
  console.log('----            ----            ----   -----');
  for (const s of reg.servers) {
    console.log(s.name.padEnd(16) + s.host.padEnd(16) + String(s.port).padEnd(7) + s.model);
  }
}
