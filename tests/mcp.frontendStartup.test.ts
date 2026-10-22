import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStartupFrontendService } from '../src/browser/frontends/config.js';
import { registerFrontendTools } from '../src/mcp/tools/frontends.js';
import { registerSessionsTool } from '../src/mcp/tools/sessions.js';

const configEnv = 'AURACALL_FRONTEND_CONFIG';
const privateValue = 'fixture-private-config-value';

describe('frontend configuration failure isolation through MCP', () => {
  it.each(['malformed', 'directory', 'oversized', 'remote-broker', 'missing-file'])('keeps sibling tools usable with %s configuration', async kind => {
    const dir = await mkdtemp(join(tmpdir(), 'auracall-invalid-frontend-'));
    const path = kind === 'directory' ? dir : join(dir, `${privateValue}.json`);
    const requestFetch = vi.fn();
    vi.stubGlobal('fetch', requestFetch);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = new Proxy({ [configEnv]: path }, { get(target, key) {
      if (key === 'FIXTURE_CAPABILITY') throw new Error('Capability lookup at startup');
      return Reflect.get(target, key);
    } });
    const server = new McpServer({ name: 'startup-regression', version: '1' });
    const client = new Client({ name: 'startup-regression-client', version: '1' });
    try {
      if (kind === 'malformed') await writeFile(path, privateValue);
      if (kind === 'oversized') await writeFile(path, privateValue.repeat(5000));
      if (kind === 'remote-broker') await writeFile(path, JSON.stringify({ brokerBaseUrl: 'https://example.com', routes: [] }));
      registerFrontendTools(server, await createStartupFrontendService(env));
      registerSessionsTool(server);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport); await client.connect(clientTransport);
      const listed = await client.listTools();
      expect(listed.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['sessions', 'frontend_inspect', 'frontend_configure']));
      for (const [name, args] of [
        ['frontend_inspect', { routeId: 'anything' }],
        ['frontend_configure', { routeId: 'anything', effort: 'pro' }],
      ] as const) {
        const response = await client.callTool({ name, arguments: args });
        expect(response.isError).toBe(true);
        expect(response.structuredContent).toMatchObject({ code: 'invalid_config', ok: false });
        expect(JSON.stringify(response)).not.toContain(path);
        expect(JSON.stringify(response)).not.toContain(privateValue);
      }
      const sibling = await client.callTool({ name: 'sessions', arguments: { limit: 1 } });
      expect(sibling.isError).not.toBe(true);
      expect(sibling.structuredContent).toHaveProperty('entries');
      expect(requestFetch).not.toHaveBeenCalled();
      expect(JSON.stringify(stderr.mock.calls)).not.toContain(path);
      expect(JSON.stringify(stderr.mock.calls)).not.toContain(privateValue);
    } finally {
      await client.close(); await server.close(); stderr.mockRestore(); vi.unstubAllGlobals();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('keeps missing configuration distinct from invalid configuration', async () => {
    const service = await createStartupFrontendService({});
    await expect(service.inspect('missing')).rejects.toMatchObject({ code: 'route_missing' });
  });
  it('does not disguise an unrelated startup exception as invalid configuration', async () => {
    const error = new Error('unexpected caller failure');
    const env = new Proxy({}, { get() { throw error; } });
    await expect(createStartupFrontendService(env)).rejects.toBe(error);
  });
});
