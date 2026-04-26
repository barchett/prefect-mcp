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

// CORE-02: Run a prompt against an OpenCode session — blocks until agent loop completes
server.registerTool(
  'opencode_run',
  {
    description: 'Send a prompt to an OpenCode session and block until the agent finishes. Returns the assistant message and parts. May take seconds to minutes depending on task complexity.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
    }),
  },
  async ({ sessionId, prompt }) => {
    try {
      // No AbortController / signal — POST /session/{id}/message holds the connection
      // open for the entire agent run. RESEARCH.md Pitfall 2.
      const { data, error } = await client.session.prompt({
        path: { id: sessionId },
        body: { parts: [{ type: 'text', text: prompt }] },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-03: Get the file diff for a session (or for a specific message)
server.registerTool(
  'opencode_get_diff',
  {
    description: 'Get the file diff for an OpenCode session. Returns an array of FileDiff objects (file, before, after, additions, deletions). If messageID is provided, returns the diff for that message; otherwise returns the diff for the session.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().optional().describe('Optional message ID to scope the diff to a single message'),
    }),
  },
  async ({ sessionId, messageID }) => {
    try {
      const { data, error } = await client.session.diff({
        path: { id: sessionId },
        query: messageID ? { messageID } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-04: Respond to an OpenCode permission request
// NOTE: REQUIREMENTS.md says allow/deny/allow_always — that's WRONG.
// The OpenCode API enum is "once" | "always" | "reject" (verified from @opencode-ai/sdk types).
server.registerTool(
  'opencode_approve_permission',
  {
    description: 'Respond to an OpenCode permission request. once = approve this request only; always = approve similar future requests; reject = deny.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      permissionId: z.string().describe('Permission request ID'),
      response: z.enum(['once', 'always', 'reject']).describe(
        'once = approve this request only; always = approve similar future requests; reject = deny'
      ),
    }),
  },
  async ({ sessionId, permissionId, response }) => {
    try {
      // CRITICAL: permissions method is on TOP-LEVEL client, NOT client.session
      const { data, error } = await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: String(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-05: Fork a session (escape hatch for corrupted sessions)
server.registerTool(
  'opencode_fork',
  {
    description: 'Fork an OpenCode session, optionally at a specific message. Returns a new Session. Use this as an escape hatch when a session has gone off the rails.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fork from'),
      messageID: z.string().optional().describe('Optional message ID to fork at; if omitted, forks at the current tip'),
    }),
  },
  async ({ sessionId, messageID }) => {
    try {
      const { data, error } = await client.session.fork({
        path: { id: sessionId },
        body: messageID ? { messageID } : {},
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-06: Revert a session to a prior message
server.registerTool(
  'opencode_revert',
  {
    description: 'Revert an OpenCode session to a prior message. messageID is required. Optionally scope to a specific part of that message via partID.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().describe('Required: message ID to revert to'),
      partID: z.string().optional().describe('Optional: specific part within the message'),
    }),
  },
  async ({ sessionId, messageID, partID }) => {
    try {
      const { data, error } = await client.session.revert({
        path: { id: sessionId },
        body: { messageID, ...(partID ? { partID } : {}) },
      });
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
