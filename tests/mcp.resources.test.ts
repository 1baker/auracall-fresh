import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { requireBuiltMcpEntry } from './mcpBuiltEntry.js';

const entry = requireBuiltMcpEntry();

describe('auracall-session resources via stdio', () => {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  beforeAll(async () => {
    const candidateClient = new Client({ name: 'resource-smoke', version: '0.0.0' });
    const candidateTransport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      stderr: 'pipe',
      cwd: path.dirname(entry),
      env: {
        ...process.env,
        AURACALL_DISABLE_KEYTAR: '1',
      },
    });
    await candidateClient.connect(candidateTransport);
    client = candidateClient;
    transport = candidateTransport;
  }, 20_000);

  afterAll(async () => {
    await client?.close().catch(() => {});
    const proc = (transport as unknown as { proc?: ChildProcess })?.proc;
    proc?.kill?.('SIGKILL');
  });

  it('responds to resource/read (metadata)', async () => {
    if (!client) {
      throw new Error('MCP client not connected');
    }
    await expect(
      client.readResource({ uri: 'auracall-session://nonexistent/metadata' }, { timeout: 10_000 }),
    ).rejects.toThrow(/Session "nonexistent" not found/);
  }, 15_000);
});
