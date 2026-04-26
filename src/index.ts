#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';

// CORE-08: Base URL from OPENCODE_URL env var, default http://localhost:4096
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const client = createOpencodeClient({ baseUrl: BASE_URL });

const server = new McpServer({ name: 'prefect', version: '1.0.0' });

// CORE-01: Create a new OpenCode session
server.registerTool(
  'opencode_create_session',
  {
    description: 'Create a new OpenCode coding session. Returns the Session object including the session id (ULID) used by all other tools.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional display title for the session'),
    }),
  },
  async ({ title }) => {
    try {
      const { data, error } = await client.session.create({ body: { title } });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-07: Abort a running session
server.registerTool(
  'opencode_abort',
  {
    description: 'Abort a running OpenCode session. Returns true on success.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID returned from opencode_create_session'),
    }),
  },
  async ({ sessionId }) => {
    try {
      const { data, error } = await client.session.abort({ path: { id: sessionId } });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: String(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never stdout (corrupts JSON-RPC stream)
  console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
