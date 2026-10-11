import { describe, expect, test, vi } from 'vitest';
import { DEFAULT_BROWSER_CONFIG } from '../../src/browser/config.js';
import {
  buildAgentBrowserRdpOpenPlan,
  launchAgentBrowserRdpSession,
  resolveAgentBrowserRdpCompatibility,
  type AgentBrowserCommandRunner,
} from '../../src/browser/service/agentBrowserRdpLauncher.js';
import type { BrowserLogger, ResolvedBrowserConfig } from '../../src/browser/types.js';

function chromeConfig(overrides: Partial<ResolvedBrowserConfig> = {}): ResolvedBrowserConfig {
  return {
    ...DEFAULT_BROWSER_CONFIG,
    browserFamily: 'chrome',
    browserBuild: 'stock_chrome',
    chromePath: '/usr/bin/google-chrome',
    agentBrowserRdp: {
      enabled: true,
      runtimeProfile: 'auracall-wsl-chrome-3',
    },
    ...overrides,
  };
}

function openedResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    success: true,
    data: {
      status: 'opened',
      browserId: 'browser-123',
      handoffUrl: 'https://guac.example.test/#/client/route-123',
      operatorVisible: {
        state: 'ready',
        browserId: 'browser-123',
      },
      browserBuildProof: {
        state: 'matched',
        requestedBrowserBuild: 'stock_chrome',
        selectedBrowserBuild: 'stock_chrome',
        actualExecutablePath: '/usr/bin/google-chrome',
      },
      ...overrides,
    },
  });
}

describe('agent-browser RDP launcher', () => {
  test('maps Chrome and chromium-stealthcdp profiles to only their compatible builds', () => {
    expect(resolveAgentBrowserRdpCompatibility(chromeConfig())).toEqual({
      browserFamily: 'chrome',
      browserBuild: 'stock_chrome',
      chromePath: '/usr/bin/google-chrome',
    });

    expect(resolveAgentBrowserRdpCompatibility(chromeConfig({
      browserFamily: 'chromium',
      browserBuild: 'stealthcdp_chromium',
      chromePath: '/opt/chromium-stealthcdp/current/chrome',
    }))).toEqual({
      browserFamily: 'chromium',
      browserBuild: 'stealthcdp_chromium',
      chromePath: '/opt/chromium-stealthcdp/current/chrome',
    });
  });

  test('refuses a build or executable from the wrong browser family', () => {
    expect(() => resolveAgentBrowserRdpCompatibility(chromeConfig({
      browserBuild: 'stealthcdp_chromium',
    }))).toThrow('chrome requires browserBuild=stock_chrome');

    expect(() => resolveAgentBrowserRdpCompatibility(chromeConfig({
      chromePath: '/opt/chromium-stealthcdp/current/chrome',
    }))).toThrow('executable-family mismatch');
  });

  test('builds an exact external-profile remote-view plan without changing AuraCall ownership', () => {
    const plan = buildAgentBrowserRdpOpenPlan({
      config: chromeConfig(),
      userDataDir: '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      auracallRuntimeProfile: 'default',
      browserProfileId: 'wsl-chrome-3',
      serviceTarget: 'chatgpt',
    });

    expect(plan.session).toBe('auracall-wsl-chrome-3-chatgpt');
    expect(plan.openArgs).toEqual(expect.arrayContaining([
      '--runtime-profile',
      'auracall-wsl-chrome-3',
      '--profile',
      '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      '--browser-host',
      'remote_headed',
      '--view-stream-provider',
      'rdp_gateway',
      '--browser-build',
      'stock_chrome',
    ]));
    expect(plan.browserInventoryArgs).toEqual([
      '--json',
      '--session',
      'auracall-wsl-chrome-3-chatgpt',
      'service',
      'browsers',
    ]);

    const chromiumPlan = buildAgentBrowserRdpOpenPlan({
      config: chromeConfig({
        browserFamily: 'chromium',
        browserBuild: 'stealthcdp_chromium',
        chromePath: '/opt/chromium-stealthcdp/current/chrome',
        agentBrowserRdp: {
          enabled: true,
          runtimeProfile: 'auracall-gemini-stealthcdp',
        },
      }),
      userDataDir: '/home/test/.auracall/browser-profiles/gemini-stealthcdp/gemini',
      url: 'https://gemini.google.com/app',
      browserProfileId: 'gemini-stealthcdp',
      serviceTarget: 'gemini',
    });
    expect(chromiumPlan.browserFamily).toBe('chromium');
    expect(chromiumPlan.openArgs).toEqual(expect.arrayContaining([
      '--profile',
      '/home/test/.auracall/browser-profiles/gemini-stealthcdp/gemini',
      '--browser-build',
      'stealthcdp_chromium',
    ]));
  });

  test.each([{ cdpHost: '127.0.0.1', cdpPort: 45015 }, { cdpEndpoint: 'http://127.0.0.1:45015' }, { cdpEndpoint: 'ws://127.0.0.1:45015/devtools/browser/abc', cdpPort: 123 }, { cdpEndpoint: 'http://127.0.0.1:80' }])('accepts an exact CDP inventory record %j', async (connection) => {
    const calls: string[][] = [];
    const runner: AgentBrowserCommandRunner = async (_executable, args) => {
      calls.push(args);
      if (calls.length === 1) {
        return { stdout: openedResponse(), stderr: '' };
      }
      return {
        stdout: JSON.stringify({
          success: true,
          data: {
            browsers: [{
              id: 'browser-123',
              ...connection,
              pid: 20260,
            }],
          },
        }),
        stderr: '',
      };
    };

    const result = await launchAgentBrowserRdpSession({
      config: chromeConfig(),
      userDataDir: '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      browserProfileId: 'wsl-chrome-3',
      serviceTarget: 'chatgpt',
      logger: vi.fn() as BrowserLogger,
      runner,
    });

    expect(calls).toHaveLength(2);
    expect(result).toEqual({
      chrome: { host: '127.0.0.1', port: connection.cdpEndpoint === 'http://127.0.0.1:80' ? 80 : 45015, pid: 20260 },
      port: connection.cdpEndpoint === 'http://127.0.0.1:80' ? 80 : 45015,
      browserId: 'browser-123',
      session: 'auracall-wsl-chrome-3-chatgpt',
      handoffUrl: 'https://guac.example.test/#/client/route-123',
    });
  });

  test.each([
    'ftp://127.0.0.1:45015', 'http://127.0.0.1', 'http://127.0.0.1:0',
    'http://127.0.0.1:65536', 'http://user:pass@127.0.0.1:45015',
    'http://127.0.0.1:45015?token=secret', 'http://127.0.0.1:45015#fragment', '',
  ])('rejects invalid canonical endpoint without legacy fallback: %s', async (cdpEndpoint) => {
    const runner = vi.fn<AgentBrowserCommandRunner>()
      .mockResolvedValueOnce({ stdout: openedResponse(), stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, data: {
        browsers: [{ id: 'browser-123', cdpEndpoint, cdpHost: '127.0.0.1', cdpPort: 45015 }],
      } }), stderr: '' });
    await expect(launchAgentBrowserRdpSession({
      config: chromeConfig(), userDataDir: '/tmp/auracall-test-profile',
      url: 'https://example.com', serviceTarget: 'chatgpt', logger: vi.fn() as BrowserLogger, runner,
    })).rejects.toThrow('invalid canonical CDP endpoint');
  });

  test('awaits the retained handoff when initial opening is converging', async () => {
    const runner = vi.fn<AgentBrowserCommandRunner>()
      .mockResolvedValueOnce({ stdout: openedResponse({
        status: 'converging', handoffId: 'handoff-123',
        handoffUrl: 'https://browser.example.test/remote-view/handoff-123',
        operatorVisible: { state: 'pending', browserId: 'browser-123' },
      }), stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, data: {
        status: 'ready', handoffId: 'handoff-123', browserId: 'browser-123',
        open: { status: 'opened', browserId: 'browser-123',
          operatorVisible: { state: 'ready', browserId: 'browser-123' } },
      } }), stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, data: {
        browsers: [{ id: 'browser-123', cdpEndpoint: 'http://127.0.0.1:45015' }],
      } }), stderr: '' });
    const result = await launchAgentBrowserRdpSession({
      config: chromeConfig(), userDataDir: '/tmp/auracall-test-profile',
      url: 'https://example.com', serviceTarget: 'chatgpt', logger: vi.fn() as BrowserLogger, runner,
    });
    expect(result.handoffUrl).toBe('https://browser.example.test/remote-view/handoff-123');
    expect(runner.mock.calls[1]?.[1]).toContain('resolve');
    expect(runner.mock.calls.filter(([, args]) => args.includes('open'))).toHaveLength(1);
  });

  test.each(['browserId', 'handoffId'])('refuses a readiness response that changes %s', async (field) => {
    const initial = openedResponse({ status: 'converging', handoffId: 'handoff-123',
      handoffUrl: '/remote-view/handoff-123', operatorVisible: { state: 'pending' } });
    const runner = vi.fn<AgentBrowserCommandRunner>()
      .mockResolvedValueOnce({ stdout: initial, stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, data: {
        status: 'opened', handoffId: 'handoff-123', browserId: 'browser-123',
        operatorVisible: { state: 'ready' }, [field]: 'foreign',
      } }), stderr: '' });
    await expect(launchAgentBrowserRdpSession({ config: chromeConfig(),
      userDataDir: '/tmp/auracall-test-profile', url: 'https://example.com',
      serviceTarget: 'chatgpt', logger: vi.fn() as BrowserLogger, runner,
    })).rejects.toThrow('changed retained handoff identity');
    expect(runner).toHaveBeenCalledTimes(2);
  });

  test('bounds readiness waiting without reopening or attaching', async () => {
    let now = 1000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      let calls = 0;
      const runner = vi.fn<AgentBrowserCommandRunner>().mockImplementation(async () => {
        calls += 1;
        if (calls === 2) now += 2;
        return {
        stdout: openedResponse({ status: 'converging', handoffId: 'handoff-123',
          handoffUrl: '/remote-view/handoff-123', operatorVisible: { state: 'pending' } }), stderr: '',
        };
      });
      const result = expect(launchAgentBrowserRdpSession({
        config: chromeConfig({ agentBrowserRdp: { enabled: true, runtimeProfile: 'test', jobTimeoutMs: 1 } }),
        userDataDir: '/tmp/auracall-test-profile', url: 'https://example.com',
        serviceTarget: 'chatgpt', logger: vi.fn() as BrowserLogger, runner,
      })).rejects.toThrow('status=converging');
      await result;
      expect(runner).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });

  test('stops before CDP attachment when the route is not visible or proof is mismatched', async () => {
    const notReady = vi.fn<AgentBrowserCommandRunner>().mockResolvedValue({
      stdout: openedResponse({ operatorVisible: { state: 'pending', browserId: 'browser-123' } }),
      stderr: '',
    });
    await expect(launchAgentBrowserRdpSession({
      config: chromeConfig(),
      userDataDir: '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      serviceTarget: 'chatgpt',
      logger: vi.fn() as BrowserLogger,
      runner: notReady,
    })).rejects.toThrow('not operator-visible');
    expect(notReady).toHaveBeenCalledTimes(1);

    const mismatched = vi.fn<AgentBrowserCommandRunner>().mockResolvedValue({
      stdout: openedResponse({
        browserBuildProof: {
          state: 'matched',
          requestedBrowserBuild: 'stock_chrome',
          selectedBrowserBuild: 'stealthcdp_chromium',
          actualExecutablePath: '/opt/chromium-stealthcdp/current/chrome',
        },
      }),
      stderr: '',
    });
    await expect(launchAgentBrowserRdpSession({
      config: chromeConfig(),
      userDataDir: '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      serviceTarget: 'chatgpt',
      logger: vi.fn() as BrowserLogger,
      runner: mismatched,
    })).rejects.toThrow('exact matching browser-build proof');
    expect(mismatched).toHaveBeenCalledTimes(1);
  });

  test('refuses attachment when browser inventory cannot prove the exact CDP owner', async () => {
    const runner = vi.fn<AgentBrowserCommandRunner>()
      .mockResolvedValueOnce({ stdout: openedResponse(), stderr: '' })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          data: {
            browsers: [{ id: 'different-browser', cdpPort: 45015 }],
          },
        }),
        stderr: '',
      });

    await expect(launchAgentBrowserRdpSession({
      config: chromeConfig(),
      userDataDir: '/home/test/.auracall/browser-profiles/wsl-chrome-3/chatgpt',
      url: 'https://chatgpt.com/',
      serviceTarget: 'chatgpt',
      logger: vi.fn() as BrowserLogger,
      runner,
    })).rejects.toThrow('did not identify one exact opened browser');
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
