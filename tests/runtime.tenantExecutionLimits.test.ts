import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryProviderInteractionLedger } from '../packages/browser-service/src/service/interactionLedger.js';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../src/runtime/control.js';
import { createExecutionRunEvent } from '../src/runtime/model.js';
import { createExecutionResponsesService } from '../src/runtime/responsesService.js';
import type { ExecutionRunStoredRecord } from '../src/runtime/store.js';
import {
  createTenantExecutionLimitGate,
  resolveChatgptBackendRequestsPerMinute,
  resolveChatgptInteractionsPerMinute,
  resolveChatgptTenantLimits,
  summarizeTenantExecutionLimits,
} from '../src/runtime/tenantExecutionLimits.js';

describe('tenant execution limits', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    setAuracallHomeDirOverrideForTest(null);
    await Promise.all(
      cleanup.splice(0).map((entry) => fs.rm(entry, { recursive: true, force: true })),
    );
  });

  it('applies default ChatGPT tenant-wide concurrent chat limits by service account', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-tenant-limits-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const config = {
      profiles: {
        'wsl-chrome-3': {
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
            },
          },
        },
        'wsl-chrome-4': {
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
            },
          },
        },
      },
    };
    expect(resolveChatgptTenantLimits(config, 'wsl-chrome-3')).toEqual({
      maxConcurrentChats: 4,
      maxChatsPerHour: 120,
      maxChatsPerDay: 240,
    });
    expect(resolveChatgptInteractionsPerMinute(config, 'wsl-chrome-3')).toBe(30);
    expect(
      resolveChatgptInteractionsPerMinute(
        {
          services: { chatgpt: { liveFollow: { maxBrowserInteractionsPerMinute: 21 } } },
          profiles: {
            'wsl-chrome-3': {
              services: { chatgpt: { liveFollow: { maxBrowserInteractionsPerMinute: 7 } } },
            },
          },
        },
        'wsl-chrome-3',
      ),
    ).toBe(7);

    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: (() => {
        const ids = [
          'resp_tenant_1',
          'resp_tenant_2',
          'resp_tenant_3',
          'resp_tenant_4',
          'resp_tenant_5',
        ];
        return () => ids.shift() ?? 'resp_tenant_extra';
      })(),
      now: () => new Date('2026-05-17T19:00:00.000Z'),
    });
    for (let index = 0; index < 5; index += 1) {
      await responsesService.createResponse({
        model: 'agent:pro-extended-chatgpt-soylei',
        input: `Prompt ${index + 1}`,
        auracall: {
          service: 'chatgpt',
          runtimeProfile: index === 4 ? 'wsl-chrome-4' : 'wsl-chrome-3',
        },
      });
    }

    const gate = createTenantExecutionLimitGate({
      control,
      config,
      now: () => new Date('2026-05-17T19:00:05.000Z'),
    });
    for (const runId of ['resp_tenant_1', 'resp_tenant_2', 'resp_tenant_3', 'resp_tenant_4']) {
      await expect(gate(await requireRun(control, runId))).resolves.toEqual({ allowed: true });
    }
    await expect(gate(await requireRun(control, 'resp_tenant_5'))).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining('concurrency limit reached: 4/4 active chats'),
    });
  });

  it('applies ChatGPT tenant hourly and daily chat starts', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-tenant-limits-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const config = {
      profiles: {
        default: {
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
              tenantLimits: {
                maxConcurrentChats: 4,
                maxChatsPerHour: 2,
                maxChatsPerDay: 10,
              },
            },
          },
        },
      },
    };
    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: (() => {
        const ids = ['resp_hour_1', 'resp_hour_2', 'resp_hour_3'];
        return () => ids.shift() ?? 'resp_hour_extra';
      })(),
      now: () => new Date('2026-05-17T20:00:00.000Z'),
    });
    await createChatgptRun(responsesService, 'resp_hour_1');
    await createChatgptRun(responsesService, 'resp_hour_2');
    await createChatgptRun(responsesService, 'resp_hour_3');
    await addStartedEvent(control, 'resp_hour_1', '2026-05-17T19:35:00.000Z');
    await addStartedEvent(control, 'resp_hour_2', '2026-05-17T19:50:00.000Z');

    const hourlyGate = createTenantExecutionLimitGate({
      control,
      config,
      now: () => new Date('2026-05-17T20:00:00.000Z'),
    });
    await expect(hourlyGate(await requireRun(control, 'resp_hour_3'))).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining('hourly chat rate limit reached: 2/2 chats per hour'),
    });

    const dailyConfig = {
      profiles: {
        default: {
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
              tenantLimits: {
                maxConcurrentChats: 4,
                maxChatsPerHour: 120,
                maxChatsPerDay: 2,
              },
            },
          },
        },
      },
    };
    const dailyGate = createTenantExecutionLimitGate({
      control,
      config: dailyConfig,
      now: () => new Date('2026-05-17T20:00:00.000Z'),
    });
    await expect(dailyGate(await requireRun(control, 'resp_hour_3'))).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining('daily chat rate limit reached: 2/2 chats per day'),
    });
  });

  it('separates same-email ChatGPT tenants when plan and structure differ', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-tenant-qualified-'));
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const config = {
      profiles: {
        business: {
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
                accountPlanType: 'team',
                accountStructure: 'workspace',
              },
            },
          },
        },
        personal: {
          services: {
            chatgpt: {
              identity: {
                email: 'operator@example.com',
                accountPlanType: 'pro',
                accountStructure: 'personal',
              },
            },
          },
        },
      },
    };
    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: (() => {
        const ids = ['resp_business', 'resp_personal'];
        return () => ids.shift() ?? 'resp_extra';
      })(),
      now: () => new Date('2026-05-18T14:00:00.000Z'),
    });
    await createChatgptRun(responsesService, 'resp_business', 'business');
    await createChatgptRun(responsesService, 'resp_personal', 'personal');
    await addStartedEvent(control, 'resp_business', '2026-05-18T13:30:00.000Z');
    await addStartedEvent(control, 'resp_personal', '2026-05-18T13:45:00.000Z');
    await addActiveLease(control, 'resp_business');

    const summary = await summarizeTenantExecutionLimits({
      control,
      config,
      now: () => new Date('2026-05-18T14:00:00.000Z'),
    });

    expect(summary.providers.chatgpt.entries).toMatchObject([
      {
        tenantKey: 'service-account:chatgpt:operator@example.com|plan=pro|structure=personal',
        runtimeProfileIds: ['personal'],
        usage: {
          activeChats: 0,
          chatsLastHour: 1,
          chatsLastDay: 1,
        },
      },
      {
        tenantKey: 'service-account:chatgpt:operator@example.com|plan=team|structure=workspace',
        runtimeProfileIds: ['business'],
        usage: {
          activeChats: 1,
          chatsLastHour: 1,
          chatsLastDay: 1,
        },
      },
    ]);
  });

  it('summarizes ChatGPT tenant limits and runtime usage for status readback', async () => {
    const homeDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'auracall-runtime-tenant-limits-status-'),
    );
    cleanup.push(homeDir);
    setAuracallHomeDirOverrideForTest(homeDir);

    const config = {
      profiles: {
        'wsl-chrome-3': {
          browserProfile: 'default',
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
            },
          },
        },
        'wsl-chrome-4': {
          browserProfile: 'wsl-chrome-4',
          services: {
            chatgpt: {
              identity: { email: 'operator@example.com' },
            },
          },
        },
      },
    };
    const control = createExecutionRuntimeControl();
    const responsesService = createExecutionResponsesService({
      control,
      drainAfterCreate: false,
      generateResponseId: (() => {
        const ids = ['resp_status_1', 'resp_status_2'];
        return () => ids.shift() ?? 'resp_status_extra';
      })(),
      now: () => new Date('2026-05-17T21:00:00.000Z'),
    });
    await createChatgptRun(responsesService, 'resp_status_1', 'wsl-chrome-3');
    await createChatgptRun(responsesService, 'resp_status_2', 'wsl-chrome-4');
    await addStartedEvent(control, 'resp_status_1', '2026-05-17T20:30:00.000Z');
    await addStartedEvent(control, 'resp_status_1', '2026-05-17T20:35:00.000Z');
    await addStartedEvent(control, 'resp_status_2', '2026-05-17T20:40:00.000Z');
    await addActiveLease(control, 'resp_status_1');

    const summary = await summarizeTenantExecutionLimits({
      control,
      config,
      now: () => new Date('2026-05-17T21:00:00.000Z'),
    });

    expect(summary).toMatchObject({
      object: 'tenant_execution_limits_status',
      generatedAt: '2026-05-17T21:00:00.000Z',
      providers: {
        chatgpt: {
          defaultLimits: {
            maxConcurrentChats: 4,
            maxChatsPerHour: 120,
            maxChatsPerDay: 240,
          },
          metrics: {
            tenantCount: 1,
            entryCount: 1,
            activeChats: 1,
            chatsLastHour: 2,
            chatsLastDay: 2,
          },
          entries: [
            {
              service: 'chatgpt',
              tenantKey: 'service-account:chatgpt:operator@example.com',
              runtimeProfileIds: ['wsl-chrome-3', 'wsl-chrome-4'],
              browserProfileIds: ['default', 'wsl-chrome-4'],
              limits: {
                maxConcurrentChats: 4,
                maxChatsPerHour: 120,
                maxChatsPerDay: 240,
              },
              usage: {
                activeChats: 1,
                chatsLastHour: 2,
                chatsLastDay: 2,
              },
            },
          ],
        },
      },
    });
  });

  it('projects durable aggregate interaction-ledger evidence when supplied', async () => {
    const config = {
      profiles: {
        default: {
          browserProfile: 'default',
          services: {
            chatgpt: { identity: { email: 'operator@example.com' } },
          },
        },
      },
    };
    const tenantKey = 'service-account:chatgpt:operator@example.com';
    let sequence = 0;
    const interactionLedger = createInMemoryProviderInteractionLedger({
      createReservationId: () => `reservation-${++sequence}`,
    });
    const policy = {
      maxConcurrentChats: 4,
      maxConversationStartsPerHour: 120,
      maxConversationStartsPerDay: 240,
    };
    const reserve = (operationId: string, now: string) =>
      interactionLedger.reserve({
        scope: {
          provider: 'chatgpt',
          tenantKey,
          runtimeProfileId: 'default',
          managedBrowserProfile: 'default',
        },
        workloadId: operationId,
        operationId,
        tabLeaseId: `lease-${operationId}`,
        interactionClass: 'conversation-start',
        mutability: 'provider-mutating',
        startsNewConversation: true,
        now,
        reservationTtlMs: 60_000,
        policy,
      });
    const settled = await reserve('operation-a', '2026-05-17T20:30:00.000Z');
    if (!settled.allowed) throw new Error('expected settled admission');
    await interactionLedger.start({
      reservationId: settled.reservation.reservationId,
      startedAt: '2026-05-17T20:30:01.000Z',
    });
    await interactionLedger.settle({
      reservationId: settled.reservation.reservationId,
      settledAt: '2026-05-17T20:30:02.000Z',
      effectState: 'settled',
      outcome: 'succeeded',
    });
    expect((await reserve('operation-b', '2026-05-17T20:59:30.000Z')).allowed).toBe(true);

    const summary = await summarizeTenantExecutionLimits({
      control: createExecutionRuntimeControl(),
      config,
      interactionLedger,
      now: () => new Date('2026-05-17T21:00:00.000Z'),
    });
    expect(summary.providers.chatgpt.entries[0]?.usage).toEqual({
      basis: 'aggregate-interaction-ledger',
      activeChats: 1,
      chatsLastHour: 2,
      chatsLastDay: 2,
      interactionsLastMinute: 1,
    });
  });
});

async function createChatgptRun(
  responsesService: ReturnType<typeof createExecutionResponsesService>,
  expectedResponseId: string,
  runtimeProfile = 'default',
): Promise<void> {
  const response = await responsesService.createResponse({
    model: 'agent:pro-extended-chatgpt-soylei',
    input: `Prompt for ${expectedResponseId}`,
    auracall: {
      service: 'chatgpt',
      runtimeProfile,
    },
  });
  expect(response.id).toBe(expectedResponseId);
}

async function addStartedEvent(
  control: ReturnType<typeof createExecutionRuntimeControl>,
  runId: string,
  createdAt: string,
): Promise<void> {
  const record = await requireRun(control, runId);
  const step = record.bundle.steps[0];
  if (!step) throw new Error(`Expected ${runId} to have a step`);
  await control.persistRun({
    runId,
    expectedRevision: record.revision,
    bundle: {
      ...record.bundle,
      events: [
        ...record.bundle.events,
        createExecutionRunEvent({
          id: `${runId}:event:started:${record.bundle.events.length + 1}`,
          runId,
          type: 'step-started',
          createdAt,
          stepId: step.id,
        }),
      ],
    },
  });
}

async function addActiveLease(
  control: ReturnType<typeof createExecutionRuntimeControl>,
  runId: string,
): Promise<void> {
  const record = await requireRun(control, runId);
  await control.persistRun({
    runId,
    expectedRevision: record.revision,
    bundle: {
      ...record.bundle,
      leases: [
        ...record.bundle.leases,
        {
          id: `${runId}:lease:status`,
          runId,
          ownerId: 'runner:test',
          status: 'active',
          acquiredAt: '2026-05-17T20:30:00.000Z',
          heartbeatAt: '2026-05-17T20:59:00.000Z',
          expiresAt: '2026-05-17T21:01:00.000Z',
          releasedAt: null,
          releaseReason: null,
        },
      ],
    },
  });
}

async function requireRun(
  control: ReturnType<typeof createExecutionRuntimeControl>,
  runId: string,
): Promise<ExecutionRunStoredRecord> {
  const record = await control.readRun(runId);
  if (!record) throw new Error(`Expected ${runId} to exist`);
  return record;
}


describe('configured backend request ceiling', () => {
  it('is opt-in and respects runtime binding overrides', () => {
    expect(resolveChatgptBackendRequestsPerMinute({}, 'a')).toBeUndefined();
    const config = {
      services: { chatgpt: { maxBackendRequestsPerMinute: 9 } },
      runtimeProfiles: { a: { services: { chatgpt: { maxBackendRequestsPerMinute: 3 } } } },
    };
    expect(resolveChatgptBackendRequestsPerMinute(config, 'a')).toBe(3);
    expect(resolveChatgptBackendRequestsPerMinute(config, 'b')).toBe(9);
  });
  it.each([0, -1, 1.5, '30', null, Number.POSITIVE_INFINITY])('rejects invalid explicit ceiling %s', (value) => {
    expect(() => resolveChatgptBackendRequestsPerMinute({
      services: { chatgpt: { maxBackendRequestsPerMinute: value } },
    }, 'a')).toThrow('positive safe integer');
  });
});
