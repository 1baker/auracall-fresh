import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../src/auracallHome.js';
import type { BrowserPassiveObservation, BrowserRunOptions } from '../src/browser/types.js';
import { resolveBrowserLaunchPlan } from '../src/browser/service/browserLaunchPlan.js';
import { createConfiguredStoredStepExecutor } from '../src/runtime/configuredExecutor.js';
import {
  readLiveRuntimeRunServiceState,
  resetLiveRuntimeRunServiceStateRegistryForTests,
} from '../src/runtime/liveServiceStateRegistry.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../src/runtime/stepOutputContract.js';

describe('configured stored-step executor', () => {
  beforeEach(() => {
    resetLiveRuntimeRunServiceStateRegistryForTests();
  });

  afterEach(() => {
    setAuracallHomeDirOverrideForTest(null);
  });

  it('binds explicit ChatGPT runtime provenance instead of the default Grok managed profile', async () => {
    const runBrowserModeImpl = vi.fn(async (_options: BrowserRunOptions) => ({
      answerText: 'AURACALL_PROFILE_PROVENANCE_OK',
      answerMarkdown: 'AURACALL_PROFILE_PROVENANCE_OK',
      tookMs: 100,
      answerTokens: 4,
      answerChars: 30,
      tabUrl: 'https://chatgpt.com/c/profile-provenance',
      conversationId: 'profile-provenance',
    }));
    const managedRoot = '/tmp/auracall/browser-profiles';
    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        auracallProfile: 'default',
        defaultRuntimeProfile: 'default',
        browser: {
          target: 'grok',
          managedProfileRoot: managedRoot,
          manualLoginProfileDir: `${managedRoot}/default/grok`,
        },
        browserProfiles: {
          default: { managedProfileRoot: managedRoot },
          'wsl-chrome-3': {
            managedProfileRoot: managedRoot,
            tabConcurrencyMode: 'tab-affinity',
          },
        },
        runtimeProfiles: {
          default: {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
          },
          'wsl-chrome-3': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'wsl-chrome-3',
            browser: { tabConcurrencyMode: 'tab-affinity' },
            services: { chatgpt: {} },
          },
        },
      },
      { runBrowserModeImpl },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_profile_provenance',
        revision: 1,
        bundle: { run: { id: 'teamrun_profile_provenance' } },
      } as never,
      step: {
        id: 'teamrun_profile_provenance:step:1',
        agentId: 'instant-chatgpt-soylei',
        runtimeProfileId: 'wsl-chrome-3',
        browserProfileId: 'wsl-chrome-3',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_PROFILE_PROVENANCE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    const options = runBrowserModeImpl.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      tabAffinityUserConfig: {
        auracallProfile: 'wsl-chrome-3',
        browser: {
          target: 'chatgpt',
        },
      },
      config: {
        auracallProfileName: 'wsl-chrome-3',
        target: 'chatgpt',
        manualLoginProfileDir: `${managedRoot}/wsl-chrome-3/chatgpt`,
        providerSessionAuthorization: {
          context: {
            providerId: 'chatgpt',
            auracallRuntimeProfile: 'wsl-chrome-3',
            browserProfile: 'wsl-chrome-3',
            managedBrowserProfile: `${managedRoot}/wsl-chrome-3/chatgpt`,
          },
        },
      },
    });
    expect(JSON.stringify(options)).not.toContain(`${managedRoot}/default/grok`);
  });

  it.each([
    {
      label: 'canonical source fields',
      sourceFields: {
        sourceProfileName: 'Runtime Source',
        sourceCookiePath: '/runtime/Cookies',
        chromeProfile: 'Ignored Legacy Source',
        chromeCookiePath: '/ignored/legacy/Cookies',
      },
      expectedSource: 'Runtime Source',
      expectedCookie: '/runtime/Cookies',
      expectedAuthoritySource: 'Runtime Source',
    },
    {
      label: 'legacy source aliases',
      sourceFields: {
        chromeProfile: 'Runtime Legacy',
        chromeCookiePath: '/runtime/legacy/Cookies',
      },
      expectedSource: 'Runtime Legacy',
      expectedCookie: '/runtime/legacy/Cookies',
      expectedAuthoritySource: 'Browser Source',
    },
    {
      label: 'browser-profile source fallback',
      sourceFields: {},
      expectedSource: 'Browser Source',
      expectedCookie: '/browser/Cookies',
      expectedAuthoritySource: 'Browser Source',
    },
  ])('preserves $label when the browser launch plan selects different defaults', async ({
    sourceFields,
    expectedSource,
    expectedCookie,
    expectedAuthoritySource,
  }) => {
    const runBrowserModeImpl = vi.fn(async (_options: BrowserRunOptions) => ({
      answerText: 'LAUNCH_CHARACTERIZATION_OK',
      answerMarkdown: 'LAUNCH_CHARACTERIZATION_OK',
      tookMs: 1,
      answerTokens: 1,
      answerChars: 26,
      tabUrl: 'https://chatgpt.com/c/launch-characterization',
      conversationId: 'launch-characterization',
    }));
    const execute = createConfiguredStoredStepExecutor(
      {
        auracallProfile: 'default',
        browser: {
          target: 'grok',
          chromePath: '/global/chrome',
          chromeProfile: 'Global Source',
          chromeCookiePath: '/global/Cookies',
          bootstrapCookiePath: '/global/bootstrap',
          display: ':71',
          managedProfileRoot: '/global/managed',
          manualLoginProfileDir: '/global/managed/default/grok',
        },
        runtimeProfiles: {
          default: { browserProfile: 'default', defaultService: 'grok' },
          selected: {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'selected-browser',
            browser: {
              tabConcurrencyMode: 'tab-affinity',
              chromePath: '/runtime/chrome',
              ...sourceFields,
              bootstrapCookiePath: '/runtime/bootstrap',
              display: ':72',
              managedProfileRoot: '/runtime/managed',
            },
          },
        },
        browserProfiles: {
          'selected-browser': {
            chromePath: '/browser/chrome',
            sourceProfilePath: '/browser/source',
            sourceProfileName: 'Browser Source',
            sourceCookiePath: '/browser/Cookies',
            bootstrapCookiePath: '/browser/bootstrap',
            display: ':73',
            managedProfileRoot: '/browser/managed',
          },
        },
      },
      { runBrowserModeImpl },
    );
    await execute?.({
      record: {
        runId: 'launch-characterization',
        bundle: { run: { id: 'launch-characterization' } },
      } as never,
      step: {
        id: 'launch-characterization:1',
        agentId: 'launch-characterization',
        runtimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
        service: 'chatgpt',
        input: {
          prompt: 'Characterize launch options',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });
    const options = runBrowserModeImpl.mock.calls[0]?.[0];
    expect(options?.config).toMatchObject({
      chromePath: '/runtime/chrome',
      chromeProfile: expectedSource,
      chromeCookiePath: expectedCookie,
      bootstrapCookiePath: '/runtime/bootstrap',
      display: ':72',
      managedProfileRoot: '/runtime/managed',
      manualLoginProfileDir: '/browser/managed/selected-browser/chatgpt',
      providerSessionAuthorization: {
        context: {
          providerId: 'chatgpt',
          auracallRuntimeProfile: 'selected',
          browserProfile: 'selected-browser',
          sourceBrowserProfile: expectedAuthoritySource,
          managedBrowserProfile: '/browser/managed/selected-browser/chatgpt',
        },
      },
    });
    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: options?.tabAffinityUserConfig as never },
      intent: {
        provider: 'chatgpt',
        runtimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
        agentId: 'launch-characterization',
      },
    });
    expect(plan.launchPolicy).toMatchObject({
      chromePath: '/browser/chrome',
      chromeProfile: 'Global Source',
      chromeCookiePath: '/browser/Cookies',
      bootstrapCookiePath: '/browser/bootstrap',
      display: ':73',
      managedProfileRoot: '/browser/managed',
    });
    expect(plan.sourceBrowserProfile).toEqual({
      rootPath: '/browser/source',
      name: 'Global Source',
      cookiePath: null,
      bootstrapCookiePath: null,
    });
    expect(options?.config).not.toHaveProperty('sourceProfilePath');
    expect(plan.launchPolicy.providerSessionAuthorization).toBeUndefined();
    expect(Object.isFrozen(options?.config?.providerSessionAuthorization)).toBe(false);
  });

  it('executes a Grok browser-backed step from runtime-profile config and returns response output', async () => {
    const runBrowserModeImpl = vi.fn(async (_options) => ({
      answerText: 'AURACALL_TEAM_SMOKE_OK',
      answerMarkdown: 'AURACALL_TEAM_SMOKE_OK',
      tookMs: 1200,
      answerTokens: 17,
      answerChars: 22,
      tabUrl: 'https://grok.com/c/mock-conversation',
      conversationId: 'mock-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_1:step:1',
        agentId: 'auracall-orchestrator',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_TEAM_SMOKE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Reply exactly with AURACALL_TEAM_SMOKE_OK',
      browserOperationOwnerCommand: 'response-run:teamrun_1:auracall-orchestrator',
      config: {
        auracallProfileName: 'default',
        target: 'grok',
        projectId: 'project_123',
        desiredModel: 'Auto',
        modelStrategy: 'select',
      },
    });
    expect(result).toMatchObject({
      output: {
        summary: 'AURACALL_TEAM_SMOKE_OK',
        notes: ['browser conversation: https://grok.com/c/mock-conversation'],
        structuredData: {
          browserRun: {
            provider: 'grok',
            service: 'grok',
            conversationId: 'mock-conversation',
            tabUrl: 'https://grok.com/c/mock-conversation',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            agentId: 'auracall-orchestrator',
            projectId: 'project_123',
            configuredUrl: 'https://grok.com/',
            desiredModel: 'Auto',
            cachePath: null,
            cachePathStatus: 'unavailable',
            cachePathReason: 'provider cache identity is not resolved during stored-step execution',
          },
        },
      },
      sharedState: {
        structuredOutputs: [
          {
            key: 'response.output',
          },
        ],
      },
    });
    expect(result?.sharedState?.structuredOutputs?.[0]?.value).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'AURACALL_TEAM_SMOKE_OK',
          },
        ],
      },
    ]);
  });

  it('spills large API prompts to a browser attachment without truncating caller input', async () => {
    const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-configured-executor-'));
    setAuracallHomeDirOverrideForTest(homeDir);
    const capturedOptions: BrowserRunOptions[] = [];
    const runBrowserModeImpl = vi.fn(async (options: BrowserRunOptions) => {
      capturedOptions.push(options);
      return {
        answerText: '{"ok":true}',
        answerMarkdown: '{"ok":true}',
        tookMs: 1200,
        answerTokens: 17,
        answerChars: 11,
        tabUrl: 'https://chatgpt.com/c/mock-conversation',
        conversationId: 'mock-conversation',
      };
    });
    const largeTranscript = `Transcript:\n${'full transcript line\n'.repeat(4000)}`;
    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          managedProfileRoot: path.join(homeDir, 'profiles'),
          tabConcurrencyMode: 'tab-affinity',
        },
        services: {
          chatgpt: { identity: { email: 'operator@example.com' } },
        },
        runtimeProfiles: {
          default: {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: path.join(homeDir, 'profiles', 'default', 'chatgpt'),
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_large',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_large',
          },
        },
      } as never,
      step: {
        id: 'teamrun_large:step:1',
        agentId: 'api-responses',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: largeTranscript,
          artifacts: [],
          structuredData: {
            metadata: {
              response_format: { type: 'json_object' },
            },
          },
          notes: ['Return a structured readout.'],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    const options = capturedOptions[0];
    expect(options?.prompt).toContain(
      'The full AuraCall request is attached as auracall-request.txt.',
    );
    expect(options?.prompt).toContain('Return exactly one valid JSON object');
    expect(options?.prompt.length).toBeLessThan(1000);
    expect(options?.attachments).toHaveLength(1);
    expect(options?.config?.tabConcurrencyMode).toBe('tab-affinity');
    expect(options?.tabAffinityUserConfig).toMatchObject({
      auracallProfile: 'default',
      browser: { tabConcurrencyMode: 'tab-affinity', target: 'chatgpt' },
    });
    expect(options?.attachments?.[0]?.displayPath).toBe('auracall-request.txt');
    const attachmentPath = options?.attachments?.[0]?.path;
    expect(attachmentPath).toBeTruthy();
    const attachment = await fs.readFile(attachmentPath ?? '', 'utf8');
    expect(attachment).toContain('Request instructions:');
    expect(attachment).toContain('Return a structured readout.');
    expect(attachment).toContain('Transcript:\nfull transcript line\nfull transcript line');
    expect(attachment).toContain('full transcript line\nfull transcript line');
  });

  it('extracts one bounded local shell action request from a JSON tool envelope', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: JSON.stringify({
        localActionRequests: [
          {
            actionType: 'shell',
            command: 'node',
            args: ['-e', "process.stdout.write('tool-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
      }),
      answerMarkdown: JSON.stringify({
        localActionRequests: [
          {
            actionType: 'shell',
            command: 'node',
            args: ['-e', "process.stdout.write('tool-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
      }),
      tookMs: 1200,
      answerTokens: 17,
      answerChars: 22,
      tabUrl: 'https://grok.com/c/mock-conversation',
      conversationId: 'mock-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_tool_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_tool_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_tool_1:step:1',
        agentId: 'auracall-tool-requester',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Emit one bounded tool envelope.',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData.localActionRequests).toEqual([
      {
        kind: 'shell',
        summary: 'Run bounded shell action: node',
        command: 'node',
        args: ['-e', "process.stdout.write('tool-ok')"],
        structuredPayload: {
          cwd: process.cwd(),
        },
        notes: [],
      },
    ]);
  });

  it('enforces opt-in AuraCall step output contract for browser-backed steps', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: JSON.stringify({
        version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        status: 'needs_local_action',
        routing: { action: 'local_action' },
        message: { markdown: 'Need one host command.' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        artifacts: [],
        handoffs: [],
      }),
      answerMarkdown: JSON.stringify({
        version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        status: 'needs_local_action',
        routing: { action: 'local_action' },
        message: { markdown: 'Need one host command.' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        artifacts: [],
        handoffs: [],
      }),
      tookMs: 1200,
      answerTokens: 21,
      answerChars: 331,
      tabUrl: 'https://grok.com/c/contract-conversation',
      conversationId: 'contract-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_contract_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_contract_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_contract_1:step:1',
        agentId: 'auracall-contract-agent',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Use the contract.',
          artifacts: [],
          structuredData: {
            responseShape: {
              contract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
            },
          },
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    const browserOptions = (
      runBrowserModeImpl as unknown as { mock: { calls: Array<[{ prompt: string }]> } }
    ).mock.calls[0]?.[0];
    expect(browserOptions?.prompt).toContain(`version "${AURACALL_STEP_OUTPUT_CONTRACT_VERSION}"`);
    expect(browserOptions?.prompt).toContain('User assignment:\nUse the contract.');
    expect(result?.output).toMatchObject({
      summary: 'Need one host command.',
      structuredData: {
        routing: { action: 'local_action' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        browserRun: {
          provider: 'grok',
          conversationId: 'contract-conversation',
        },
      },
    });
    expect(result?.sharedState?.structuredOutputs).toContainEqual({
      key: 'response.output',
      value: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Need one host command.' }],
        },
      ],
    });
  });

  it('executes a Gemini browser-backed step through the Gemini web executor path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-executor-'));
    const managedProfileDir = path.join(tmpDir, 'browser-profiles', 'default', 'gemini');
    await fs.mkdir(managedProfileDir, { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'cookies.json'),
      JSON.stringify([
        { name: '__Secure-1PSID', value: 'psid', domain: '.google.com', path: '/' },
        { name: '__Secure-1PSIDTS', value: 'psidts', domain: '.google.com', path: '/' },
      ]),
      'utf8',
    );

    const runBrowserModeImpl = vi.fn(async () => {
      throw new Error('chatgpt/grok executor should not be used for Gemini');
    });
    const runGeminiBrowserModeImpl = vi.fn(async (_options) => ({
      answerText: 'AURACALL_GEMINI_TEAM_SMOKE_OK',
      answerMarkdown: 'AURACALL_GEMINI_TEAM_SMOKE_OK',
      tookMs: 900,
      answerTokens: 12,
      answerChars: 29,
      conversationId: 'mock-conversation',
      tabUrl: 'https://gemini.google.com/app',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
        runtimeProfiles: {
          'auracall-gemini-pro': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              gemini: {
                model: 'Gemini 3 Pro',
                manualLoginProfileDir: managedProfileDir,
              },
            },
          },
        },
      },
      { runBrowserModeImpl, runGeminiBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_gemini_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_1:step:1',
        agentId: 'auracall-gemini-tool-requester',
        runtimeProfileId: 'auracall-gemini-pro',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_TEAM_SMOKE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runGeminiBrowserModeImpl).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl).not.toHaveBeenCalled();
    expect(runGeminiBrowserModeImpl.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Reply exactly with AURACALL_GEMINI_TEAM_SMOKE_OK',
      config: {
        auracallProfileName: 'default',
        target: 'gemini',
        desiredModel: 'Gemini 3 Pro',
        modelStrategy: 'select',
        chromeProfile: 'Default',
        chromeCookiePath: '/tmp/source/Cookies',
        bootstrapCookiePath: '/tmp/source/Cookies',
        inlineCookiesSource: 'scoped:cookies.json',
      },
    });
    expect(runGeminiBrowserModeImpl.mock.calls[0]?.[0]?.config?.inlineCookies).toMatchObject([
      { name: '__Secure-1PSID', value: 'psid' },
      { name: '__Secure-1PSIDTS', value: 'psidts' },
    ]);
    expect(result?.output?.summary).toBe('AURACALL_GEMINI_TEAM_SMOKE_OK');
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'gemini',
      conversationId: 'mock-conversation',
      tabUrl: 'https://gemini.google.com/app',
      service: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      browserProfileId: 'default',
      agentId: 'auracall-gemini-tool-requester',
      configuredUrl: 'https://gemini.google.com/app',
      desiredModel: 'Gemini 3 Pro',
      cachePath: null,
      cachePathStatus: 'unavailable',
    });
  });

  it('publishes transient Gemini live thinking state while the browser-backed executor is in flight', async () => {
    let resolveGeminiRun:
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null = null;
    const runGeminiBrowserModeImpl = vi.fn(
      () =>
        new Promise<{
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }>((resolve) => {
          resolveGeminiRun = resolve;
        }),
    );

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          'auracall-gemini-pro': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
          },
        },
      },
      { runGeminiBrowserModeImpl },
    );
    if (!executeStoredRunStep) {
      throw new Error('expected configured stored-step executor to be defined');
    }

    const executionPromise = executeStoredRunStep({
      record: {
        runId: 'teamrun_gemini_live_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_live_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_live_1:step:1',
        agentId: 'auracall-gemini-finisher',
        runtimeProfileId: 'auracall-gemini-pro',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_LIVE_STATE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    await vi.waitFor(() => {
      expect(
        readLiveRuntimeRunServiceState({
          runId: 'teamrun_gemini_live_1',
          stepId: 'teamrun_gemini_live_1:step:1',
          service: 'gemini',
        }),
      ).toMatchObject({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'gemini-web-request-started',
        confidence: 'medium',
      });
    });

    const settleGeminiRun = resolveGeminiRun as
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null;
    if (!settleGeminiRun) {
      throw new Error('Gemini browser run resolver was not captured');
    }
    settleGeminiRun({
      answerText: 'AURACALL_GEMINI_LIVE_STATE_OK',
      answerMarkdown: 'AURACALL_GEMINI_LIVE_STATE_OK',
      tookMs: 250,
      answerTokens: 8,
      answerChars: 30,
    });

    await executionPromise;

    expect(
      readLiveRuntimeRunServiceState({
        runId: 'teamrun_gemini_live_1',
        stepId: 'teamrun_gemini_live_1:step:1',
        service: 'gemini',
      }),
    ).toBeNull();
  });

  it('publishes transient Grok live thinking state while the browser-backed executor is in flight', async () => {
    let resolveGrokRun:
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null = null;
    const runBrowserModeImpl = vi.fn(
      () =>
        new Promise<{
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }>((resolve) => {
          resolveGrokRun = resolve;
        }),
    );

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
          },
        },
      },
      { runBrowserModeImpl },
    );
    if (!executeStoredRunStep) {
      throw new Error('expected configured stored-step executor to be defined');
    }

    const executionPromise = executeStoredRunStep({
      record: {
        runId: 'teamrun_grok_live_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_grok_live_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_grok_live_1:step:1',
        agentId: 'auracall-grok-finisher',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_LIVE_STATE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    await vi.waitFor(() => {
      expect(
        readLiveRuntimeRunServiceState({
          runId: 'teamrun_grok_live_1',
          stepId: 'teamrun_grok_live_1:step:1',
          service: 'grok',
        }),
      ).toMatchObject({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      });
    });

    const settleGrokRun = resolveGrokRun as
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null;
    if (!settleGrokRun) {
      throw new Error('Grok browser run resolver was not captured');
    }
    settleGrokRun({
      answerText: 'AURACALL_GROK_LIVE_STATE_OK',
      answerMarkdown: 'AURACALL_GROK_LIVE_STATE_OK',
      tookMs: 250,
      answerTokens: 8,
      answerChars: 28,
    });

    await executionPromise;

    expect(
      readLiveRuntimeRunServiceState({
        runId: 'teamrun_grok_live_1',
        stepId: 'teamrun_grok_live_1:step:1',
        service: 'grok',
      }),
    ).toBeNull();
  });

  it('persists ChatGPT passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:00.000Z',
        evidenceRef: 'Thinking about response',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:04.000Z',
        evidenceRef: 'chatgpt-assistant-snapshot',
        confidence: 'high',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:07.000Z',
        evidenceRef: 'chatgpt-response-finished',
        confidence: 'high',
      },
    ];
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_CHATGPT_OBS_OK',
      answerMarkdown: 'AURACALL_CHATGPT_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 24,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-observation',
      conversationId: 'mock-chatgpt-observation',
      composerCapability: {
        requested: 'deep-research',
        observed: {
          id: 'chatgpt.research.deep_research',
          label: 'Deep research',
          kind: 'composer_tool' as const,
          availability: 'available' as const,
          connectionState: 'not_applicable' as const,
          verified: true as const,
        },
      },
      chatgptDeepResearchStage: 'plan-edit-opened',
      chatgptDeepResearchPlanAction: 'edit',
      chatgptDeepResearchStartMethod: null,
      chatgptDeepResearchModifyPlanLabel: 'Update',
      chatgptDeepResearchModifyPlanVisible: true,
      chatgptDeepResearchReviewEvidence: {
        stage: 'plan-edit-opened',
        screenshotPath: '/tmp/deep-research-review.png',
      },
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/g/g-p-observations',
            identity: {
              email: 'consult@polymerconsultinggroup.com',
              accountLevel: 'Pro',
            },
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-observations': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              chatgpt: {
                model: 'GPT-5.2',
                projectId: 'g-p-observations',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_obs_1',
            initialInputs: {
              auracall: {
                chatgptMode: 'work',
                chatgptToolApproval: 'allow-once',
                workModel: 'Research',
                composerTool: 'deep-research',
                deepResearchPlanAction: 'edit',
              },
            },
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_obs_1:step:1',
        agentId: 'auracall-chatgpt-observer',
        runtimeProfileId: 'auracall-chatgpt-observations',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          manualLogin: true,
          manualLoginWaitForSession: false,
          chatgptMode: 'work',
          chatgptToolApproval: 'allow-once',
          workModel: 'Research',
          composerTool: 'deep-research',
          deepResearchPlanAction: 'edit',
          providerSessionAuthorization: expect.objectContaining({
            expectation: expect.objectContaining({
              configuredIdentity: expect.objectContaining({
                email: 'consult@polymerconsultinggroup.com',
                accountLevel: 'Pro',
              }),
              configuredServiceAccountId:
                'service-account:chatgpt:consult@polymerconsultinggroup.com',
            }),
          }),
        }),
      }),
    );
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      conversationId: 'mock-chatgpt-observation',
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-observation',
      runtimeProfileId: 'auracall-chatgpt-observations',
      browserProfileId: 'default',
      agentId: 'auracall-chatgpt-observer',
      projectId: 'g-p-observations',
      configuredUrl: 'https://chatgpt.com/g/g-p-observations/project',
      desiredModel: 'GPT-5.2',
      composerCapability: {
        requested: 'deep-research',
        observed: {
          id: 'chatgpt.research.deep_research',
          label: 'Deep research',
          kind: 'composer_tool',
          availability: 'available',
          connectionState: 'not_applicable',
          verified: true,
        },
      },
      chatgptDeepResearchStage: 'plan-edit-opened',
      chatgptDeepResearchPlanAction: 'edit',
      chatgptDeepResearchModifyPlanLabel: 'Update',
      chatgptDeepResearchModifyPlanVisible: true,
      chatgptDeepResearchReviewEvidence: {
        stage: 'plan-edit-opened',
        screenshotPath: '/tmp/deep-research-review.png',
      },
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:04.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:07.000Z',
        },
      ],
    });
  });

  it('converts ChatGPT passive runtime evidence into lease heartbeats and live service state', async () => {
    const runtimeEvidenceHeartbeats: unknown[] = [];
    const runBrowserModeImpl = vi.fn(async (options: BrowserRunOptions) => {
      await options.runtimeHintCb?.({
        chromePort: 45012,
        chromeHost: '127.0.0.1',
        chromeTargetId: 'target-evidence',
        tabUrl: 'https://chatgpt.com/c/evidence-chat',
        conversationId: 'evidence-chat',
      });
      await options.runtimeEvidenceCb?.({
        observation: {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-15T21:30:00.000Z',
          evidenceRef: 'chatgpt-passive-dom-thinking',
          confidence: 'medium',
        },
        runtime: {
          chromePort: 45012,
          chromeHost: '127.0.0.1',
          chromeTargetId: 'target-evidence',
          tabUrl: 'https://chatgpt.com/c/evidence-chat',
          conversationId: 'evidence-chat',
        },
      });
      expect(
        readLiveRuntimeRunServiceState({
          runId: 'teamrun_chatgpt_evidence_1',
          stepId: 'teamrun_chatgpt_evidence_1:step:1',
          service: 'chatgpt',
        }),
      ).toMatchObject({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'chatgpt-passive-dom-thinking',
        confidence: 'medium',
        observedAt: '2026-04-15T21:30:00.000Z',
      });
      return {
        answerText: 'AURACALL_CHATGPT_EVIDENCE_OK',
        answerMarkdown: 'AURACALL_CHATGPT_EVIDENCE_OK',
        tookMs: 900,
        answerTokens: 10,
        answerChars: 28,
        tabUrl: 'https://chatgpt.com/c/evidence-chat',
        conversationId: 'evidence-chat',
      };
    });

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        runtimeProfiles: {
          default: {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_evidence_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_evidence_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_evidence_1:step:1',
        agentId: 'chatgpt-evidence-agent',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_EVIDENCE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
      runtimeEvidence: {
        heartbeat: vi.fn(async (evidence) => {
          runtimeEvidenceHeartbeats.push(evidence);
        }),
      },
    } as never);

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeHintCb: expect.any(Function),
        runtimeEvidenceCb: expect.any(Function),
      }),
    );
    expect(runtimeEvidenceHeartbeats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'browser-runtime-hint',
          source: 'browser-service',
          evidenceRef: 'https://chatgpt.com/c/evidence-chat',
        }),
        expect.objectContaining({
          observedAt: '2026-04-15T21:30:00.000Z',
          state: 'thinking',
          source: 'browser-service',
          evidenceRef: 'chatgpt-passive-dom-thinking',
          confidence: 'medium',
          details: expect.objectContaining({
            service: 'chatgpt',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            agentId: 'chatgpt-evidence-agent',
            chromeTargetId: 'target-evidence',
            tabUrl: 'https://chatgpt.com/c/evidence-chat',
            conversationId: 'evidence-chat',
          }),
        }),
      ]),
    );
    expect(
      readLiveRuntimeRunServiceState({
        runId: 'teamrun_chatgpt_evidence_1',
        stepId: 'teamrun_chatgpt_evidence_1:step:1',
        service: 'chatgpt',
      }),
    ).toBeNull();
  });

  it('reattaches recovered stranded ChatGPT steps to the submitted tab instead of replaying the prompt', async () => {
    const runBrowserModeImpl = vi.fn(async () => {
      throw new Error('prompt replay should not run');
    });
    const resumeBrowserSessionImpl = vi.fn(async () => ({
      answerText: 'AURACALL_REATTACHED_OK',
      answerMarkdown: 'AURACALL_REATTACHED_OK',
    }));
    const runtimeEvidenceHeartbeat = vi.fn(async () => undefined);

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        runtimeProfiles: {
          default: {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl, resumeBrowserSessionImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_recovered_1',
        revision: 3,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_recovered_1',
            initialInputs: {},
          },
          events: [
            {
              id: 'teamrun_chatgpt_recovered_1:event:runtime',
              runId: 'teamrun_chatgpt_recovered_1',
              type: 'note-added',
              createdAt: '2026-04-15T21:35:00.000Z',
              leaseId: 'teamrun_chatgpt_recovered_1:lease:1',
              note: 'lease heartbeat from runner:http-responses:127.0.0.1:18095',
              payload: {
                runtimeEvidence: {
                  observedAt: '2026-04-15T21:35:00.000Z',
                  state: 'thinking',
                  source: 'browser-service',
                  evidenceRef: 'chatgpt-passive-dom-probe',
                  confidence: 'low',
                  details: {
                    service: 'chatgpt',
                    runtimeProfileId: 'default',
                    browserProfileId: 'default',
                    agentId: 'chatgpt-recovered-agent',
                    chromePort: 45012,
                    chromeHost: '127.0.0.1',
                    chromeTargetId: 'target-restart',
                    tabUrl: 'https://chatgpt.com/c/recovered-chat',
                    conversationId: 'recovered-chat',
                  },
                },
              },
            },
            {
              id: 'teamrun_chatgpt_recovered_1:event:recovered',
              runId: 'teamrun_chatgpt_recovered_1',
              type: 'note-added',
              createdAt: '2026-04-15T21:36:00.000Z',
              stepId: 'teamrun_chatgpt_recovered_1:step:1',
              note: 'recovered stranded running step for host replay',
              payload: {
                source: 'service-host',
              },
            },
          ],
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_recovered_1:step:1',
        agentId: 'chatgpt-recovered-agent',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_REATTACHED_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
      runtimeEvidence: {
        heartbeat: runtimeEvidenceHeartbeat,
      },
    });

    expect(runBrowserModeImpl).not.toHaveBeenCalled();
    expect(resumeBrowserSessionImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        chromePort: 45012,
        chromeHost: '127.0.0.1',
        chromeTargetId: 'target-restart',
        tabUrl: 'https://chatgpt.com/c/recovered-chat',
        conversationId: 'recovered-chat',
      }),
      expect.objectContaining({
        target: 'chatgpt',
        manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
      }),
      expect.any(Function),
      expect.objectContaining({
        promptPreview: expect.stringContaining('Reply exactly with AURACALL_REATTACHED_OK'),
        waitForAssistantResponse: expect.any(Function),
      }),
    );
    expect(runtimeEvidenceHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'chatgpt-reattach-existing-tab',
        confidence: 'medium',
        details: expect.objectContaining({
          service: 'chatgpt',
          runtimeProfileId: 'default',
          browserProfileId: 'default',
          agentId: 'chatgpt-recovered-agent',
          chromePort: 45012,
          chromeHost: '127.0.0.1',
          chromeTargetId: 'target-restart',
          tabUrl: 'https://chatgpt.com/c/recovered-chat',
          conversationId: 'recovered-chat',
        }),
      }),
    );
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      conversationId: 'recovered-chat',
      tabUrl: 'https://chatgpt.com/c/recovered-chat',
      chromeTargetId: 'target-restart',
      runtimeProfileId: 'default',
      browserProfileId: 'default',
      agentId: 'chatgpt-recovered-agent',
    });
  });

  it('replays recovered ChatGPT steps when only pre-submit project evidence was recorded', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_REPLAYED_OK',
      answerMarkdown: 'AURACALL_REPLAYED_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 20,
      tabUrl: 'https://chatgpt.com/c/replayed-chat',
      conversationId: 'replayed-chat',
    }));
    const resumeBrowserSessionImpl = vi.fn(async () => {
      throw new Error('pre-submit project evidence should not reattach');
    });

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        runtimeProfiles: {
          default: {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl, resumeBrowserSessionImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_presubmit_1',
        revision: 3,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_presubmit_1',
            initialInputs: {},
          },
          events: [
            {
              id: 'teamrun_chatgpt_presubmit_1:event:runtime',
              runId: 'teamrun_chatgpt_presubmit_1',
              type: 'note-added',
              createdAt: '2026-05-18T15:37:47.498Z',
              leaseId: 'teamrun_chatgpt_presubmit_1:lease:1',
              note: 'lease heartbeat from runner:http-responses:127.0.0.1:18095',
              payload: {
                runtimeEvidence: {
                  observedAt: '2026-05-18T15:37:47.498Z',
                  state: 'browser-runtime-hint',
                  source: 'browser-service',
                  evidenceRef: 'https://chatgpt.com/g/g-p-example/project',
                  confidence: 'medium',
                  details: {
                    service: 'chatgpt',
                    runtimeProfileId: 'default',
                    browserProfileId: 'default',
                    agentId: 'chatgpt-recovered-agent',
                    chromePort: 45012,
                    chromeHost: '127.0.0.1',
                    chromeTargetId: 'target-pre-submit',
                    tabUrl: 'https://chatgpt.com/g/g-p-example/project',
                    conversationId: null,
                  },
                },
              },
            },
            {
              id: 'teamrun_chatgpt_presubmit_1:event:recovered',
              runId: 'teamrun_chatgpt_presubmit_1',
              type: 'note-added',
              createdAt: '2026-05-18T15:38:10.000Z',
              stepId: 'teamrun_chatgpt_presubmit_1:step:1',
              note: 'recovered stranded running step for host replay',
              payload: {
                source: 'service-host',
              },
            },
          ],
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_presubmit_1:step:1',
        agentId: 'chatgpt-recovered-agent',
        runtimeProfileId: 'default',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_REPLAYED_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(resumeBrowserSessionImpl).not.toHaveBeenCalled();
    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      conversationId: 'replayed-chat',
      tabUrl: 'https://chatgpt.com/c/replayed-chat',
    });
  });

  it('resolves ChatGPT semantic agent model selectors into browser model and thinking controls', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_CHATGPT_SELECTOR_OK',
      answerMarkdown: 'AURACALL_CHATGPT_SELECTOR_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 28,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-selector',
      conversationId: 'mock-chatgpt-selector',
      observedModel: '5.6 Instant',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-selector': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
                identity: { email: 'researcher@example.com', accountLevel: 'Pro' },
              },
            },
          },
        },
        agents: {
          'pro-researcher': {
            runtimeProfile: 'auracall-chatgpt-selector',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
            projectId: 'proj_semantic',
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_selector_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_selector_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_selector_1:step:1',
        agentId: 'pro-researcher',
        runtimeProfileId: 'auracall-chatgpt-selector',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_SELECTOR_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          selectedAgentId: 'pro-researcher',
          desiredModel: 'GPT-5.6 Sol',
          thinkingTime: 'extended',
          projectId: 'proj_semantic',
          chatgptUrl: 'https://chatgpt.com/g/proj_semantic/project',
          url: 'https://chatgpt.com/g/proj_semantic/project',
        }),
      }),
    );
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      agentId: 'pro-researcher',
      projectId: 'proj_semantic',
      configuredUrl: 'https://chatgpt.com/g/proj_semantic/project',
      desiredModel: 'GPT-5.6 Sol',
      observedModel: '5.6 Instant',
      modelSelector: 'chatgpt:pro-extended',
      thinkingTime: 'extended',
    });
  });

  it('resolves agents from an effective registry-backed config provider', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_REGISTRY_AGENT_OK',
      answerMarkdown: 'AURACALL_REGISTRY_AGENT_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 26,
      tabUrl: 'https://chatgpt.com/c/mock-registry-agent',
      conversationId: 'mock-registry-agent',
    }));
    const effectiveConfigProvider = vi.fn(async () => ({
      browserProfiles: {
        default: {
          chromePath: '/usr/bin/google-chrome',
          sourceProfileName: 'Default',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
      },
      runtimeProfiles: {
        'registry-chatgpt-profile': {
          engine: 'browser',
          defaultService: 'chatgpt',
          browserProfile: 'default',
          services: {
            chatgpt: {
              manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
            },
          },
        },
      },
      agents: {
        'registry-pro-researcher': {
          runtimeProfile: 'registry-chatgpt-profile',
          service: 'chatgpt',
          modelSelector: 'chatgpt:pro-standard',
          projectId: 'proj_registry',
        },
      },
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {},
        runtimeProfiles: {},
      },
      {
        runBrowserModeImpl,
        effectiveConfigProvider,
      },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_registry_agent_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_registry_agent_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_registry_agent_1:step:1',
        agentId: 'registry-pro-researcher',
        runtimeProfileId: null,
        browserProfileId: null,
        service: null,
        input: {
          prompt: 'Reply exactly with AURACALL_REGISTRY_AGENT_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(effectiveConfigProvider).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          auracallProfileName: 'default',
          selectedAgentId: 'registry-pro-researcher',
          desiredModel: 'GPT-5.6 Sol',
          thinkingTime: 'standard',
          projectId: 'proj_registry',
          chatgptUrl: 'https://chatgpt.com/g/proj_registry/project',
          url: 'https://chatgpt.com/g/proj_registry/project',
        }),
      }),
    );
  });

  it('materializes declared browser response artifacts into step and shared state', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'legacy_readout.json ready',
      answerMarkdown: 'legacy_readout.json ready',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 25,
      tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact',
      conversationId: 'mock-registry-artifact',
      chromeTargetId: 'target-artifact',
      chromeHost: '127.0.0.1',
      chromePort: 45011,
    }));
    const browserResponseArtifactMaterializer = vi.fn(async () => ({
      artifacts: [
        {
          id: 'legacy-readout-json',
          kind: 'file',
          title: 'legacy_readout.json',
          path: '/tmp/legacy_readout.json',
          uri: null,
        },
      ],
      notes: ['browser response artifact materialization: discovered=1 materialized=1'],
    }));
    const runtimeEvidenceHeartbeat = vi.fn(async () => undefined);

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'registry-chatgpt-profile': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
                identity: { email: 'researcher@example.com', accountLevel: 'Pro' },
              },
            },
          },
        },
        agents: {
          'registry-pro-researcher': {
            runtimeProfile: 'registry-chatgpt-profile',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
            projectId: 'proj_registry',
          },
        },
      },
      {
        runBrowserModeImpl,
        browserResponseArtifactMaterializer,
      },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_registry_artifact_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_registry_artifact_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_registry_artifact_1:step:1',
        agentId: 'registry-pro-researcher',
        runtimeProfileId: null,
        browserProfileId: null,
        service: null,
        input: {
          prompt: 'Create legacy_readout.json and reply when ready.',
          artifacts: [],
          structuredData: {
            metadata: {
              outputContract: {
                mode: 'chatgpt_workspace_artifact',
                artifactFileName: 'legacy_readout.json',
              },
            },
          },
          notes: [],
        },
      } as never,
      runtimeEvidence: {
        heartbeat: runtimeEvidenceHeartbeat,
      },
    });

    expect(browserResponseArtifactMaterializer).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'chatgpt',
        conversationId: 'mock-registry-artifact',
        projectId: 'proj_registry',
        configuredUrl: 'https://chatgpt.com/g/proj_registry/project',
        tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact',
        tabTargetId: 'target-artifact',
        chromeHost: '127.0.0.1',
        chromePort: 45011,
      }),
    );
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Create a downloadable/workspace file artifact named exactly legacy_readout.json.',
        ),
      }),
    );
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'write the requested output to /mnt/data/legacy_readout.json',
        ),
      }),
    );
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          '[legacy_readout.json](sandbox:/mnt/data/legacy_readout.json)',
        ),
      }),
    );
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Do not reply that legacy_readout.json is ready until the file artifact exists',
        ),
      }),
    );
    expect(result?.output?.artifacts).toEqual([
      {
        id: 'legacy-readout-json',
        kind: 'file',
        title: 'legacy_readout.json',
        path: '/tmp/legacy_readout.json',
        uri: null,
      },
    ]);
    expect(result?.sharedState?.artifacts).toEqual(result?.output?.artifacts);
    expect(result?.sharedState?.structuredOutputs).toContainEqual({
      key: 'response.output',
      value: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'legacy_readout.json ready' }],
        },
      ],
    });
    expect(runtimeEvidenceHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'response-complete',
        source: 'browser-service',
        evidenceRef: 'browser-response-artifact-finalizing',
        confidence: 'medium',
        details: expect.objectContaining({
          service: 'chatgpt',
          runtimeProfileId: 'registry-chatgpt-profile',
          browserProfileId: 'default',
          agentId: 'registry-pro-researcher',
          chromePort: 45011,
          chromeHost: '127.0.0.1',
          chromeTargetId: 'target-artifact',
          tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact',
          conversationId: 'mock-registry-artifact',
        }),
      }),
    );
  });

  it('fails declared browser response artifact runs when only status text is returned', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: "I'll create the artifact now.",
      answerMarkdown: "I'll create the artifact now.",
      tookMs: 700,
      answerTokens: 8,
      answerChars: 29,
      tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact-missing',
      conversationId: 'mock-registry-artifact-missing',
      chromeTargetId: 'target-artifact-missing',
      chromeHost: '127.0.0.1',
      chromePort: 45011,
    }));
    const browserResponseArtifactMaterializer = vi.fn(async () => ({
      artifacts: [
        {
          id: 'generated-sandbox-ref',
          kind: 'generated',
          title: 'legacy_readout.json',
          path: null,
          uri: 'sandbox:/mnt/data/legacy_readout.json',
        },
      ],
      notes: ['browser response artifact materialization: discovered=1 materialized=0'],
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'registry-chatgpt-profile': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
        agents: {
          'registry-pro-researcher': {
            runtimeProfile: 'registry-chatgpt-profile',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
            projectId: 'proj_registry',
          },
        },
      },
      {
        runBrowserModeImpl,
        browserResponseArtifactMaterializer,
      },
    );

    await expect(
      executeStoredRunStep?.({
        record: {
          runId: 'teamrun_registry_artifact_missing_1',
          revision: 1,
          bundle: {
            run: {
              id: 'teamrun_registry_artifact_missing_1',
            },
          },
        } as never,
        step: {
          id: 'teamrun_registry_artifact_missing_1:step:1',
          agentId: 'registry-pro-researcher',
          runtimeProfileId: null,
          browserProfileId: null,
          service: null,
          input: {
            prompt: 'Create legacy_readout.json and reply when ready.',
            artifacts: [],
            structuredData: {
              metadata: {
                outputContract: {
                  mode: 'chatgpt_workspace_artifact',
                  artifactFileName: 'legacy_readout.json',
                },
              },
            },
            notes: [],
          },
        } as never,
      }),
    ).rejects.toThrow(/completed without required artifact legacy_readout\.json/);
  });

  it('retries once in the same ChatGPT conversation when a required artifact reply is status-only', async () => {
    const runBrowserModeImpl = vi
      .fn()
      .mockResolvedValueOnce({
        answerText: "I'll create the artifact now.",
        answerMarkdown: "I'll create the artifact now.",
        tookMs: 700,
        answerTokens: 8,
        answerChars: 29,
        tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact-retry',
        conversationId: 'mock-registry-artifact-retry',
        chromeTargetId: 'target-artifact-retry',
        chromeHost: '127.0.0.1',
        chromePort: 45011,
      })
      .mockResolvedValueOnce({
        answerText: '[legacy_readout.json](sandbox:/mnt/data/legacy_readout.json)',
        answerMarkdown: '[legacy_readout.json](sandbox:/mnt/data/legacy_readout.json)',
        tookMs: 900,
        answerTokens: 10,
        answerChars: 60,
        tabUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact-retry',
        conversationId: 'mock-registry-artifact-retry',
        chromeTargetId: 'target-artifact-retry',
        chromeHost: '127.0.0.1',
        chromePort: 45011,
      });
    const browserResponseArtifactMaterializer = vi
      .fn()
      .mockResolvedValueOnce({
        artifacts: [
          {
            id: 'generated-sandbox-ref',
            kind: 'generated',
            title: 'legacy_readout.json',
            path: null,
            uri: 'sandbox:/mnt/data/legacy_readout.json',
          },
        ],
        notes: ['browser response artifact materialization: discovered=1 materialized=0'],
      })
      .mockResolvedValueOnce({
        artifacts: [
          {
            id: 'legacy-readout-json',
            kind: 'file',
            title: 'legacy_readout.json',
            path: '/tmp/legacy_readout.json',
            uri: null,
          },
        ],
        notes: ['browser response artifact materialization: discovered=1 materialized=1'],
      });

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'registry-chatgpt-profile': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
        agents: {
          'registry-pro-researcher': {
            runtimeProfile: 'registry-chatgpt-profile',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
            projectId: 'proj_registry',
          },
        },
      },
      {
        runBrowserModeImpl,
        browserResponseArtifactMaterializer,
      },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_registry_artifact_retry_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_registry_artifact_retry_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_registry_artifact_retry_1:step:1',
        agentId: 'registry-pro-researcher',
        runtimeProfileId: null,
        browserProfileId: null,
        service: null,
        input: {
          prompt: 'Create legacy_readout.json and reply when ready.',
          artifacts: [],
          structuredData: {
            metadata: {
              outputContract: {
                mode: 'chatgpt_workspace_artifact',
                artifactFileName: 'legacy_readout.json',
              },
            },
          },
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(2);
    expect(runBrowserModeImpl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Your previous reply did not provide a downloadable legacy_readout.json artifact.',
        ),
        attachments: [],
        config: expect.objectContaining({
          conversationId: 'mock-registry-artifact-retry',
          url: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact-retry',
          chatgptUrl: 'https://chatgpt.com/g/proj_registry/c/mock-registry-artifact-retry',
        }),
      }),
    );
    expect(browserResponseArtifactMaterializer).toHaveBeenCalledTimes(2);
    expect(result?.output?.artifacts).toEqual([
      {
        id: 'legacy-readout-json',
        kind: 'file',
        title: 'legacy_readout.json',
        path: '/tmp/legacy_readout.json',
        uri: null,
      },
    ]);
    expect(result?.output?.notes).toContain(
      'browser response artifact correction: retrying once in the same ChatGPT conversation',
    );
    expect(result?.output?.summary).toContain('legacy_readout.json');
  });

  it('keeps exact ChatGPT agent model pins ahead of semantic selector defaults', async () => {
    const runBrowserModeImpl = vi.fn(async (_options: BrowserRunOptions) => ({
      answerText: 'AURACALL_CHATGPT_PIN_OK',
      answerMarkdown: 'AURACALL_CHATGPT_PIN_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 23,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-pin',
      conversationId: 'mock-chatgpt-pin',
      libraryFiles: {
        requested: [{ id: 'file_packet' }],
        attached: [{ id: 'file_packet', name: 'Packet.pdf', provider: 'chatgpt' as const }],
        inventoryObservedAt: '2026-09-27T12:00:00.000Z',
      },
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-pin': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
        agents: {
          pinned: {
            runtimeProfile: 'auracall-chatgpt-pin',
            service: 'chatgpt',
            model: 'GPT-5.2',
            modelSelector: 'chatgpt:pro-extended',
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_pin_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_pin_1',
            initialInputs: {
              auracall: { libraryFiles: [{ id: 'file_packet' }] },
            },
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_pin_1:step:1',
        agentId: 'pinned',
        runtimeProfileId: 'auracall-chatgpt-pin',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_PIN_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          desiredModel: 'GPT-5.2',
        }),
        libraryFiles: [{ id: 'file_packet' }],
      }),
    );
    const callOptions = runBrowserModeImpl.mock.calls.at(0)?.[0] as
      | { config?: { thinkingTime?: string } }
      | undefined;
    expect(callOptions?.config?.thinkingTime).toBeUndefined();
    expect(result?.output?.structuredData).toMatchObject({
      browserRun: {
        libraryFiles: {
          requested: [{ id: 'file_packet' }],
          attached: [{ id: 'file_packet', name: 'Packet.pdf', provider: 'chatgpt' }],
        },
      },
    });
  });

  it('persists Gemini passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:00.000Z',
        evidenceRef: 'gemini-thoughts',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:04.000Z',
        evidenceRef: 'gemini-web-response-text',
        confidence: 'medium',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:06.000Z',
        evidenceRef: 'gemini-web-response-finished',
        confidence: 'high',
      },
    ];
    const runGeminiBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_GEMINI_OBS_OK',
      answerMarkdown: 'AURACALL_GEMINI_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 23,
      tabUrl: 'https://gemini.google.com/app/mock-gemini-observation',
      conversationId: 'mock-gemini-observation',
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
        runtimeProfiles: {
          'auracall-gemini-observations': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              gemini: {
                model: 'Gemini 3 Pro',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/gemini',
              },
            },
          },
        },
      },
      { runGeminiBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_gemini_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_obs_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_obs_1:step:1',
        agentId: 'auracall-gemini-observer',
        runtimeProfileId: 'auracall-gemini-observations',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'gemini',
      service: 'gemini',
      conversationId: 'mock-gemini-observation',
      tabUrl: 'https://gemini.google.com/app/mock-gemini-observation',
      runtimeProfileId: 'auracall-gemini-observations',
      browserProfileId: 'default',
      agentId: 'auracall-gemini-observer',
      configuredUrl: 'https://gemini.google.com/app',
      desiredModel: 'Gemini 3 Pro',
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:04.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:06.000Z',
        },
      ],
    });
  });

  it('persists Grok passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:00.000Z',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:03.000Z',
        evidenceRef: 'grok-assistant-visible',
        confidence: 'high',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:07.000Z',
        evidenceRef: 'grok-response-finished',
        confidence: 'high',
      },
    ];
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_GROK_OBS_OK',
      answerMarkdown: 'AURACALL_GROK_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 21,
      tabUrl: 'https://grok.com/c/mock-grok-observation',
      conversationId: 'mock-grok-observation',
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-observations': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Grok 4.1',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_grok_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_grok_obs_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_grok_obs_1:step:1',
        agentId: 'auracall-grok-observer',
        runtimeProfileId: 'auracall-grok-observations',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'grok',
      service: 'grok',
      conversationId: 'mock-grok-observation',
      tabUrl: 'https://grok.com/c/mock-grok-observation',
      runtimeProfileId: 'auracall-grok-observations',
      browserProfileId: 'default',
      agentId: 'auracall-grok-observer',
      configuredUrl: 'https://grok.com/',
      desiredModel: 'Grok 4.1',
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:03.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:07.000Z',
        },
      ],
    });
  });

  it('fails browser-backed steps that complete without assistant output', async () => {
    const runBrowserModeImpl = vi.fn(async (_options: BrowserRunOptions) => ({
      answerText: '',
      answerMarkdown: '',
      tookMs: 1200,
      answerTokens: 0,
      answerChars: 0,
      tabUrl: 'https://chatgpt.com/c/empty-output',
      conversationId: 'empty-output',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        runtimeProfiles: {
          'wsl-chrome-3': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'wsl-chrome-3',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/wsl-chrome-3/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    await expect(
      executeStoredRunStep?.({
        record: {
          runId: 'teamrun_empty_output',
          revision: 1,
          bundle: {
            run: {
              id: 'teamrun_empty_output',
            },
          },
        } as never,
        step: {
          id: 'teamrun_empty_output:step:1',
          agentId: 'pro-extended-chatgpt-soylei-transcripts',
          runtimeProfileId: 'wsl-chrome-3',
          browserProfileId: 'wsl-chrome-3',
          service: 'chatgpt',
          input: {
            prompt: 'Return JSON.',
            artifacts: [],
            structuredData: {},
            notes: [],
          },
        } as never,
      }),
    ).rejects.toThrow('completed without assistant output');
  });
});
