// biome-ignore-all lint/style/useNamingConvention: Native provider fixtures use fixed POSIX environment keys.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, test } from 'vitest';
import { RemoteViewApplication } from '../../src/browser/service/remoteViewApplication.js';

describe('native Remote View application boundary', () => {
  it('requests the configured application inventory and joins exact live assignment generations', async () => {
    const requests: unknown[] = [];
    const inventory = {
      schemaVersion: 1,
      registration: { consumerKey: 'auracall', registrationId: 'registration-a' },
      pools: [{ poolId: 'pool-a', registrationId: 'registration-a', name: 'main', desktopMembers: ['desktop-a', 'desktop-b'] }],
      assignments: [
        { assignmentId: 'assignment-a', registrationId: 'registration-a', poolId: 'pool-a', desktopId: 'desktop-a', generation: 2, state: 'active' },
        { assignmentId: 'assignment-b', registrationId: 'foreign', poolId: 'pool-a', desktopId: 'desktop-b', generation: 2, state: 'active' },
      ],
      desktops: ['desktop-a', 'desktop-b'].map(desktopId => ({ desktopId,
        lifecycle: { generation: 2, state: 'ready', readinessScope: 'live_resource', allocated: true },
        viewing: { lifecycleGeneration: 2, generation: 7, desktopId: `viewer-${desktopId}`, publicRoute: '/1' },
      })),
    };
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(inventory));
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing fixture port');
      const app = new RemoteViewApplication({ origin: `http://127.0.0.1:${address.port}`, application: 'auracall' });
      expect(await app.listReadyAssignments('main')).toEqual([{ assignmentId: 'assignment-a', desktopId: 'desktop-a', generation: 2, viewingGeneration: 7 }]);
      expect(requests).toEqual([{ path: '/v1/consumer', body: { application: 'auracall', request: { operation: 'inventory' } } }]);
      const firstDesktop = inventory.desktops[0];
      if (!firstDesktop) throw new Error('missing fixture desktop');
      firstDesktop.viewing.lifecycleGeneration = 3;
      expect(await app.listReadyAssignments('main')).toEqual([]);
      inventory.registration.consumerKey = 'foreign';
      await expect(app.listReadyAssignments('main')).rejects.toThrow('application identity');
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it('issues only a fresh native observe embed after current ownership readback', async () => {
    const calls: Array<{ application: string; request: Record<string, unknown> }> = [];
    const target = { assignmentId: 'assignment-a', registrationId: 'registration-a', desktopId: 'desktop-a', lifecycleGeneration: 2, viewingDesktopId: 'viewer-a', viewingGeneration: 7 };
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const envelope = JSON.parse(Buffer.concat(chunks).toString()); calls.push(envelope);
      res.setHeader('Content-Type', 'application/json');
      const request = envelope.request;
      const grantTime = Date.now();
      const data = request.operation === 'observe_assignment'
        ? { schemaVersion: 1, target, readinessScope: 'live_resource' }
        : { schemaVersion: 1, path: '/embed/11111111-1111-4111-8111-111111111111', readinessScope: 'live_resource',
          grant: { routeId: '11111111-1111-4111-8111-111111111111', revoked: false, issuedAt: grantTime, expiresAt: grantTime + 300000,
            request: { application: 'auracall', target, capability: 'observe', audience: 'https://aura.example.test' } } };
      res.end(JSON.stringify(data));
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
      const app = new RemoteViewApplication({ origin: `http://127.0.0.1:${address.port}`, application: 'auracall' });
      const selected = { assignmentId: 'assignment-a', desktopId: 'desktop-a', generation: 2, viewingGeneration: 7 };
      expect(await app.issueObserveEmbed(selected, { publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' })).toBe('https://desktop.example.test/embed/11111111-1111-4111-8111-111111111111');
      expect(calls.map(call => call.request.operation)).toEqual(['observe_assignment', 'issue_view']);
      expect(calls[1]?.request).toMatchObject({ capability: 'observe', expected_generation: 2, expected_viewing_generation: 7, audience: 'https://aura.example.test' });
      expect(calls[1]?.request.idempotency_key).toEqual(expect.any(String));
      target.lifecycleGeneration = 3;
      await expect(app.issueObserveEmbed(selected, { publicOrigin: 'https://desktop.example.test', appOrigin: 'https://aura.example.test' })).rejects.toThrow('generation');
      expect(calls).toHaveLength(3);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it('refuses control origins with remote hosts, credentials, paths or query state', () => {
    for (const origin of ['https://127.0.0.1', 'http://example.com', 'http://user@127.0.0.1', 'http://127.0.0.1/path', 'http://127.0.0.1?token=secret']) {
      expect(() => new RemoteViewApplication({ origin, application: 'auracall' })).toThrow('loopback HTTP origin');
    }
  });
});

test('native acquisition binds the configured pool and obtains a generation-qualified child environment', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const target = { assignmentId: 'a', registrationId: 'r', desktopId: 'd', lifecycleGeneration: 2, viewingDesktopId: 'v', viewingGeneration: 7 };
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const { request } = JSON.parse(Buffer.concat(chunks).toString()); requests.push(request);
    res.setHeader('Content-Type', 'application/json');
    let data: unknown;
    if (request.operation === 'acquire') data = { assignmentId: 'a', registrationId: 'r', poolId: 'p', desktopId: 'd', generation: 2, state: 'active' };
    else if (request.operation === 'inventory') data = { schemaVersion: 1, registration: { consumerKey: 'auracall', registrationId: 'r' },
      pools: [{ poolId: 'p', registrationId: 'r', name: 'main', desktopMembers: ['d'] }],
      assignments: [{ assignmentId: 'a', registrationId: 'r', poolId: 'p', desktopId: 'd', generation: 2, state: 'active' }],
      desktops: [{ desktopId: 'd', lifecycle: { generation: 2, state: 'ready', readinessScope: 'live_resource', allocated: true }, viewing: { desktopId: 'v', lifecycleGeneration: 2, generation: 7, publicRoute: '/1' } }] };
    else data = { schemaVersion: 1, target, readinessScope: 'live_resource', environment: { DISPLAY: ':77', XAUTHORITY: '/private/Xauthority', REMOTE_VIEW_SLOT_GENERATION: '7', WAYLAND_DISPLAY: '' } };
    res.end(JSON.stringify(data));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing fixture port');
    const app = new RemoteViewApplication({ origin: `http://127.0.0.1:${address.port}`, application: 'auracall' });
    const assignment = await app.acquire('main', 'stable-research-acquisition', 'Research');
    expect(await app.launchEnvironment(assignment)).toMatchObject({ DISPLAY: ':77', XAUTHORITY: '/private/Xauthority', REMOTE_VIEW_SLOT_GENERATION: '7' });
    expect(requests[0]).toMatchObject({ operation: 'acquire', pool_name: 'main', idempotency_key: 'stable-research-acquisition' });
    expect(requests.map(request => request.operation)).toEqual(['acquire', 'inventory', 'launch_environment']);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
