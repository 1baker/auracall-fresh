import { describe, expect, test } from 'vitest';
import { ConfigSchema } from '../../src/schema/types.js';
import { buildAgentBrowserRdpOpenPlan, findConfiguredDesktopBrowser, launchAgentBrowserRdpSession } from '../../src/browser/service/agentBrowserRdpLauncher.js';
import { vi } from 'vitest';
import { resolveBrowserLaunchPlan } from '../../src/browser/service/browserLaunchPlan.js';
import type { ResolvedBrowserConfig } from '../../src/browser/types.js';

function configuredDesktops() {
  return ConfigSchema.parse({
    auracallProfile: 'primary',
    remoteView: {
      defaultDesktop: 'research',
      desktops: {
        research: { runtimeProfile: 'auracall-research', routePoolEntryId: 'route-research' },
        writing: { runtimeProfile: 'auracall-writing', routePoolEntryId: 'route-writing' },
      },
    },
    browser: { managedProfileRoot: '/tmp/desktop-launch', target: 'chatgpt' },
    runtimeProfiles: {
      primary: { browserProfile: 'primary-browser' },
      secondary: { browserProfile: 'secondary-browser' },
    },
    browserProfiles: {
      'primary-browser': { browserFamily: 'chrome', browserBuild: 'stock_chrome', chromePath: '/usr/bin/google-chrome' },
      'secondary-browser': { browserFamily: 'chrome', browserBuild: 'stock_chrome', chromePath: '/usr/bin/google-chrome', desktop: 'writing' },
    },
  });
}

describe('configured desktop browser launches', () => {
  test('the global desktop applies and browser-profile assignment selects a distinct exact route', () => {
    const config = configuredDesktops();
    const primary = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: { runtimeProfileId: 'primary' } });
    const secondary = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config }, intent: { runtimeProfileId: 'secondary' } });
    expect(primary.launchPolicy.agentBrowserRdp).toMatchObject({ enabled: true, runtimeProfile: 'auracall-research', routePoolEntryId: 'route-research', desktopName: 'research' });
    expect(secondary.launchPolicy.agentBrowserRdp).toMatchObject({ enabled: true, runtimeProfile: 'auracall-writing', routePoolEntryId: 'route-writing', desktopName: 'writing' });
    expect(primary.managedBrowserProfile.directory).toBe('/tmp/desktop-launch/primary-browser/chatgpt');
    expect(primary.launchPolicy).toMatchObject({ headless: false, hideWindow: false, keepBrowser: true });
  });
  test('unavailable exact route is rejected before any remote-view open', async () => {
    const config = configuredDesktops();
    const plan = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config } });
    const runner = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes('status')) return { stdout: JSON.stringify({ success: true, data: { service_state: { routePool: { research: { id: 'route-research', provider: 'rdp_gateway', state: 'unavailable' } } } } }), stderr: '' };
      throw new Error(`Unexpected launch: ${args.join(' ')}`);
    });
    await expect(launchAgentBrowserRdpSession({ config: structuredClone(plan.launchPolicy) as ResolvedBrowserConfig, userDataDir: plan.managedBrowserProfile.directory, url: 'about:blank', serviceTarget: 'chatgpt', logger: () => {}, runner })).rejects.toThrow('route-research is unavailable');
    expect(runner.mock.calls.some(([, args]) => args.includes('open'))).toBe(false);
  });

  test('root selection remains explicit and an unknown named desktop fails before launch', () => {
    const config = configuredDesktops();
    const browserProfile = config.browserProfiles?.['primary-browser'];
    if (!browserProfile) throw new Error('Fixture requires primary browser profile');
    browserProfile.desktop = 'root';
    expect(resolveBrowserLaunchPlan({ source: { kind: 'user-config', config } }).launchPolicy.agentBrowserRdp)
      .toMatchObject({ enabled: false, desktopName: 'root' });
    browserProfile.desktop = 'missing';
    expect(() => resolveBrowserLaunchPlan({ source: { kind: 'user-config', config } })).toThrow('Unknown AuraCall desktop');
  });

  test('read-only attachment accepts the exact session/display and rejects stale placement without launching', async () => {
    const launch = resolveBrowserLaunchPlan({ source: { kind: 'user-config', config: configuredDesktops() } });
    const options = { config: structuredClone(launch.launchPolicy) as ResolvedBrowserConfig, userDataDir: launch.managedBrowserProfile.directory, url: 'about:blank', serviceTarget: 'chatgpt' as const, logger: () => {} };
    const plan = buildAgentBrowserRdpOpenPlan(options);
    let allocation = 'remote-view-display:research-route';
    const runner = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes('status')) return { stdout: JSON.stringify({ success: true, data: { service_state: { routePool: { research: { id: 'route-research', provider: 'rdp_gateway', state: 'checked_out', routeId: 'research-route', target: { displayName: ':20' } } } } } }), stderr: '' };
      if (args.includes('browsers')) return { stdout: JSON.stringify({ success: true, data: { browsers: [{ id: 'research-browser', activeSessionIds: [plan.session], health: 'ready', cdpEndpoint: 'http://127.0.0.1:45123', displayAllocationId: allocation, viewStreams: [{ routeId: 'research-route', displayAllocationId: allocation }] }] } }), stderr: '' };
      throw new Error('Unexpected browser launch');
    });
    expect(await findConfiguredDesktopBrowser({ ...options, runner })).toEqual({ host: '127.0.0.1', port: 45123 });
    allocation = 'wrong-display';
    await expect(findConfiguredDesktopBrowser({ ...options, runner })).rejects.toThrow('different route/display');
    expect(runner.mock.calls.some(([, args]) => args.includes('open'))).toBe(false);
  });

});
