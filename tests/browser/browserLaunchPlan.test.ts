import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { createProviderSessionAuthorization } from '../../src/browser/providers/providerSessionAuthority.js';
import { resolveBrowserLaunchPlan } from '../../src/browser/service/browserLaunchPlan.js';

describe('resolveBrowserLaunchPlan', () => {
  test('gives explicit runtime launch overrides priority over browser-profile and global defaults', () => {
    const config = {
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
          browserProfile: 'selected-browser',
          defaultService: 'chatgpt',
          browser: {
            chromePath: '/runtime/chrome',
            sourceProfilePath: '/runtime/source',
            sourceProfileName: 'Runtime Source',
            sourceCookiePath: '/runtime/Cookies',
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
    };
    const before = structuredClone(config);
    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
      intent: {
        provider: 'chatgpt',
        runtimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
      },
    });
    expect(plan.launchPolicy).toMatchObject({
      chromePath: '/runtime/chrome',
      chromeProfile: 'Runtime Source',
      chromeCookiePath: '/runtime/Cookies',
      bootstrapCookiePath: '/runtime/bootstrap',
      display: ':72',
      managedProfileRoot: '/runtime/managed',
    });
    expect(plan.sourceBrowserProfile).toEqual({
      rootPath: '/runtime/source',
      name: 'Runtime Source',
      cookiePath: null,
      bootstrapCookiePath: null,
    });
    expect(plan.managedBrowserProfile.directory).toBe('/runtime/managed/selected-browser/chatgpt');
    expect(config).toEqual(before);
  });

  test.each([
    {
      label: 'browser settings after blank runtime values',
      browser: {
        chromePath: '/browser/chrome',
        sourceProfileName: 'Browser Source',
        managedProfileRoot: '/browser/managed',
      },
      expected: {
        chromePath: '/browser/chrome',
        chromeProfile: 'Browser Source',
        managedProfileRoot: '/browser/managed',
      },
    },
    {
      label: 'global defaults after blank runtime and selected browser settings',
      browser: { chromePath: ' ', sourceProfileName: '', managedProfileRoot: ' ' },
      expected: {
        chromePath: '/global/chrome',
        chromeProfile: 'Global Source',
        managedProfileRoot: '/global/managed',
      },
    },
  ])('uses $label while honoring explicit browser selection', ({ browser, expected }) => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'default',
          browser: {
            target: 'grok',
            chromePath: '/global/chrome',
            chromeProfile: 'Global Source',
            managedProfileRoot: '/global/managed',
            manualLoginProfileDir: '/global/managed/default/grok',
          },
          runtimeProfiles: {
            default: { defaultService: 'grok' },
            selected: {
              browserProfile: 'ignored-browser',
              browser: { chromePath: ' ', sourceProfileName: ' ', managedProfileRoot: '' },
            },
          },
          browserProfiles: {
            'ignored-browser': {
              chromePath: '/ignored/chrome',
              sourceProfileName: 'Ignored Source',
            },
            explicit: browser,
          },
        } as never,
      },
      intent: { provider: 'chatgpt', runtimeProfileId: 'selected', browserProfileId: 'explicit' },
    });
    expect(plan.launchPolicy).toMatchObject(expected);
    expect(plan.selection.browserProfileId).toBe('explicit');
    expect(plan.managedBrowserProfile.directory).not.toBe('/global/managed/default/grok');
  });

  test('retains an explicit runtime managed directory instead of a stale global provider directory', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'default',
          browser: { target: 'grok', manualLoginProfileDir: '/stale/grok' },
          runtimeProfiles: {
            selected: {
              browserProfile: 'work',
              browser: { manualLoginProfileDir: '/explicit/runtime/chatgpt' },
            },
          },
        } as never,
      },
      intent: { provider: 'chatgpt', runtimeProfileId: 'selected' },
    });
    expect(plan.managedBrowserProfile.directory).toBe('/explicit/runtime/chatgpt');
  });

  test.each([
    false,
    true,
  ])('copies the selected source cookies only with runtime opt-in %s', async (cookieSync) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-runtime-source-'));
    try {
      const selectedCookie = path.join(root, 'runtime-Cookies');
      const otherCookie = path.join(root, 'browser-Cookies');
      await fs.writeFile(selectedCookie, 'synthetic runtime cookies');
      await fs.writeFile(otherCookie, 'synthetic browser cookies');
      const plan = resolveBrowserLaunchPlan({
        source: {
          kind: 'user-config',
          config: {
            browser: { cookieSync: !cookieSync, managedProfileRoot: root },
            runtimeProfiles: {
              selected: {
                browserProfile: 'work',
                browser: { cookieSync, sourceCookiePath: selectedCookie },
              },
            },
            browserProfiles: { work: { cookieSync: !cookieSync, sourceCookiePath: otherCookie } },
          } as never,
        },
        intent: { provider: 'chatgpt', runtimeProfileId: 'selected' },
      });
      expect(plan.launchPolicy.cookieSync).toBe(cookieSync);
      expect(plan.sourceBrowserProfile.cookiePath).toBe(cookieSync ? selectedCookie : null);
      expect(plan.sourceBrowserProfile.bootstrapCookiePath).toBe(
        cookieSync ? selectedCookie : null,
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('derives cookies from the selected source root and honors a separately requested bootstrap', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-source-root-'));
    try {
      const sourceRoot = path.join(root, 'source');
      const cookiePath = path.join(sourceRoot, 'Runtime Source', 'Network', 'Cookies');
      await fs.mkdir(path.dirname(cookiePath), { recursive: true });
      await fs.writeFile(cookiePath, 'synthetic cookies');
      const resolve = (cookieSync: boolean, explicitBootstrap: boolean) => resolveBrowserLaunchPlan({
        source: { kind: 'user-config', config: {
          browser: { managedProfileRoot: root },
          runtimeProfiles: { selected: { browserProfile: 'work', browser: {
            sourceProfilePath: sourceRoot, sourceProfileName: 'Runtime Source', cookieSync,
            ...(explicitBootstrap ? { bootstrapCookiePath: cookiePath } : {}),
          } } },
          browserProfiles: { work: { sourceProfilePath: '/ignored/source', sourceProfileName: 'Ignored Source' } },
        } as never },
        intent: { provider: 'chatgpt', runtimeProfileId: 'selected' },
      });
      expect(resolve(true, false).sourceBrowserProfile).toEqual({
        rootPath: sourceRoot, name: 'Runtime Source', cookiePath, bootstrapCookiePath: cookiePath,
      });
      expect(resolve(false, true).sourceBrowserProfile).toEqual({
        rootPath: sourceRoot, name: 'Runtime Source', cookiePath: null, bootstrapCookiePath: cookiePath,
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('preserves an explicit provider binding manual-login preference during default resolution', () => {
    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: {
        runtimeProfiles: { selected: { services: { chatgpt: { manualLogin: false } } } },
      } as never },
      intent: { provider: 'chatgpt', runtimeProfileId: 'selected' },
    });
    expect(plan.launchPolicy.manualLogin).toBe(false);
  });

  test('returns an immutable browser launch plan without mutating user configuration', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        target: 'grok' as const,
        chromePath: '/usr/bin/google-chrome',
        chromeProfile: 'Default',
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
      },
    };
    const before = structuredClone(config);

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
      intent: { provider: 'grok' },
    });

    expect({
      provider: plan.providerBinding.provider,
      managedDirectory: plan.managedBrowserProfile.directory,
      planFrozen: Object.isFrozen(plan),
      nestedFrozen: Object.isFrozen(plan.managedBrowserProfile),
      inputAfterResolution: config,
    }).toEqual({
      provider: 'grok',
      managedDirectory: '/tmp/auracall-browser-launch-plan/work/grok',
      planFrozen: true,
      nestedFrozen: true,
      inputAfterResolution: before,
    });
  });

  test('resolves explicit AuraCall runtime and browser profile intent without caller-side merging', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        target: 'chatgpt' as const,
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
      },
      runtimeProfiles: {
        default: { browserProfile: 'default', defaultService: 'chatgpt' },
        work: { browserProfile: 'work-browser', defaultService: 'grok' },
      },
      browserProfiles: {
        default: { chromePath: '/usr/bin/google-chrome' },
        'work-browser': { chromePath: '/opt/work/google-chrome' },
        consulting: {
          chromePath: '/opt/consulting/google-chrome',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      agents: {
        analyst: { runtimeProfile: 'work' },
      },
    };

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
      intent: {
        provider: 'grok',
        runtimeProfileId: 'default',
        browserProfileId: 'consulting',
        agentId: 'analyst',
      },
    });

    expect({
      selection: plan.selection,
      executablePath: plan.launchPolicy.chromePath,
      managedDirectory: plan.managedBrowserProfile.directory,
    }).toEqual({
      selection: {
        auraCallRuntimeProfileId: 'default',
        browserProfileId: 'consulting',
        agentId: 'analyst',
      },
      executablePath: '/opt/consulting/google-chrome',
      managedDirectory: '/tmp/auracall-browser-launch-plan/consulting/grok',
    });
  });

  test('does not let stale flattened browser fields override an explicitly selected browser profile', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'default',
          browser: {
            target: 'chatgpt',
            chromePath: '/stale/default/chrome',
            managedProfileRoot: '/tmp/auracall-browser-launch-plan',
          },
          runtimeProfiles: {
            default: { browserProfile: 'default-browser', defaultService: 'chatgpt' },
            selected: { browserProfile: 'selected-browser', defaultService: 'grok' },
          },
          browserProfiles: {
            'default-browser': { chromePath: '/stale/default/chrome' },
            'selected-browser': {
              chromePath: '/selected/chrome',
              managedProfileRoot: '/tmp/auracall-browser-launch-plan',
            },
          },
        } as never,
      },
      intent: {
        provider: 'grok',
        runtimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
      },
    });

    expect({
      selection: plan.selection,
      browserProfileChromePath: plan.browserProfile.chromePath,
      launchPolicyChromePath: plan.launchPolicy.chromePath,
      managedDirectory: plan.managedBrowserProfile.directory,
    }).toEqual({
      selection: {
        auraCallRuntimeProfileId: 'selected',
        browserProfileId: 'selected-browser',
        agentId: null,
      },
      browserProfileChromePath: '/selected/chrome',
      launchPolicyChromePath: '/selected/chrome',
      managedDirectory: '/tmp/auracall-browser-launch-plan/selected-browser/grok',
    });
  });

  test('resolves session provider intent into the same managed browser launch plan', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: {
          auracallProfileName: 'session-profile',
          target: 'chatgpt',
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Profile 1',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      intent: { provider: 'gemini' },
    });

    expect({
      provider: plan.providerBinding.provider,
      policyTarget: plan.launchPolicy.target,
      managedDirectory: plan.managedBrowserProfile.directory,
      configuredProfileName: plan.managedBrowserProfile.configuredProfileName,
    }).toEqual({
      provider: 'gemini',
      policyTarget: 'gemini',
      managedDirectory: '/tmp/auracall-browser-launch-plan/session-profile/gemini',
      configuredProfileName: 'Profile 1',
    });
  });

  test('keeps runtime provider-session authorization outside the immutable launch snapshot', () => {
    const providerSessionAuthorization = createProviderSessionAuthorization(
      {},
      {
        providerId: 'chatgpt',
        auracallRuntimeProfile: 'session-profile',
        browserProfile: 'session-profile',
        managedBrowserProfile: '/tmp/auracall-browser-launch-plan/session-profile/chatgpt',
      },
    );
    const config = {
      auracallProfileName: 'session-profile',
      target: 'chatgpt' as const,
      managedProfileRoot: '/tmp/auracall-browser-launch-plan',
      providerSessionAuthorization,
    };

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'session-config', config },
      intent: { provider: 'chatgpt' },
    });

    expect(plan.launchPolicy.providerSessionAuthorization).toBeUndefined();
    expect(config.providerSessionAuthorization).toBe(providerSessionAuthorization);
    expect(providerSessionAuthorization.authority.resolveExpectation(
      providerSessionAuthorization.context,
    )).toEqual(providerSessionAuthorization.expectation);
  });

  test('binds the selected session provider to its resolved launch URL', () => {
    const plan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: {
          auracallProfileName: 'session-profile',
          target: 'chatgpt',
          geminiUrl: 'https://gemini.google.com/app/example',
          managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        },
      },
      intent: { provider: 'gemini' },
    });

    expect(plan.providerBinding.serviceUrl).toBe('https://gemini.google.com/app/example');
  });

  test('uses the selected AuraCall runtime profile default and deep-freezes nested arrays', () => {
    const config = {
      auracallProfile: 'work',
      browser: {
        managedProfileRoot: '/tmp/auracall-browser-launch-plan',
        cookieNames: ['__Secure-session'],
        inlineCookies: [{ name: 'test-cookie', value: 'test-value', domain: 'example.com' }],
        remoteChrome: { host: '127.0.0.1', port: 9222 },
      },
      runtimeProfiles: {
        work: { browserProfile: 'consulting', defaultService: 'gemini' },
      },
      browserProfiles: {
        consulting: { debugPortRange: [46000, 46100] },
      },
      services: {
        gemini: { url: 'https://gemini.google.com/app/runtime-default' },
      },
    };

    const plan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: config as never },
    });

    expect({
      provider: plan.providerBinding.provider,
      serviceUrl: plan.providerBinding.serviceUrl,
      target: plan.launchPolicy.target,
      cookieNamesFrozen: Object.isFrozen(plan.launchPolicy.cookieNames),
      portRangeFrozen: Object.isFrozen(plan.browserProfile.debugPortRange),
      inputCookieNamesFrozen: Object.isFrozen(config.browser.cookieNames),
      inlineCookieFrozen: Object.isFrozen(plan.launchPolicy.inlineCookies?.[0]),
      remoteChromeFrozen: Object.isFrozen(plan.launchPolicy.remoteChrome),
      cookieNamesShared: plan.launchPolicy.cookieNames === config.browser.cookieNames,
      inlineCookiesShared: plan.launchPolicy.inlineCookies === config.browser.inlineCookies,
      remoteChromeShared: plan.launchPolicy.remoteChrome === config.browser.remoteChrome,
    }).toEqual({
      provider: 'gemini',
      serviceUrl: 'https://gemini.google.com/app/runtime-default',
      target: 'gemini',
      cookieNamesFrozen: true,
      portRangeFrozen: true,
      inputCookieNamesFrozen: false,
      inlineCookieFrozen: true,
      remoteChromeFrozen: true,
      cookieNamesShared: false,
      inlineCookiesShared: false,
      remoteChromeShared: false,
    });
    expect(() => {
      (plan.launchPolicy.remoteChrome as { port: number }).port = 9333;
    }).toThrow(TypeError);
  });

  test('produces field-for-field equivalent plans for equivalent user and session sources', () => {
    const sharedBrowser = {
      target: 'gemini' as const,
      chromePath: '/opt/google/chrome',
      chromeProfile: 'Profile 2',
      managedProfileRoot: '/tmp/auracall-browser-launch-plan-parity',
      geminiUrl: 'https://gemini.google.com/app/parity',
      targetUrl: 'https://gemini.google.com/app/parity',
      auracallProfileName: 'work',
      projectId: null,
      conversationId: null,
      debugPortRange: [47000, 47100] as [number, number],
    };
    const userPlan = resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          auracallProfile: 'work',
          browser: sharedBrowser,
          runtimeProfiles: {
            work: { defaultService: 'gemini' },
          },
          services: {
            gemini: { url: sharedBrowser.geminiUrl },
          },
        } as never,
      },
      intent: { provider: 'gemini' },
    });
    const sessionPlan = resolveBrowserLaunchPlan({
      source: {
        kind: 'session-config',
        config: sharedBrowser,
      },
      intent: { provider: 'gemini' },
    });

    expect(sessionPlan).toEqual(userPlan);
    expect(sessionPlan).not.toBe(userPlan);
    expect(sessionPlan.launchPolicy).not.toBe(userPlan.launchPolicy);
  });

  test('selects the active signed-in managed browser subprofile without changing the configured profile', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-launch-plan-'));
    try {
      const directory = path.join(managedRoot, 'work', 'chatgpt');
      const sourceCookiePath = path.join(managedRoot, 'source', 'Default', 'Network', 'Cookies');
      await fs.mkdir(path.join(directory, 'Default'), { recursive: true });
      await fs.mkdir(path.join(directory, 'Profile 1'), { recursive: true });
      await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
      await fs.writeFile(sourceCookiePath, '');
      await fs.writeFile(
        path.join(directory, 'Local State'),
        JSON.stringify({
          profile: {
            last_used: 'Profile 1',
            info_cache: {
              // biome-ignore lint/complexity/useLiteralKeys: quoted Chrome profile key avoids naming-convention diagnostics.
              ['Default']: { user_name: '', is_consented_primary_account: false },
              'Profile 1': {
                user_name: 'signed-in@example.com',
                is_consented_primary_account: true,
              },
            },
          },
        }),
      );

      const plan = resolveBrowserLaunchPlan({
        source: {
          kind: 'session-config',
          config: {
            auracallProfileName: 'work',
            target: 'chatgpt',
            chromeProfile: 'Default',
            chromeCookiePath: sourceCookiePath,
            cookieSync: true,
            managedProfileRoot: managedRoot,
          },
        },
      });

      expect(plan.managedBrowserProfile).toMatchObject({
        configuredProfileName: 'Default',
        activeProfileName: 'Profile 1',
      });
      expect(plan.sourceBrowserProfile).toMatchObject({
        name: 'Default',
        cookiePath: sourceCookiePath,
      });
    } finally {
      await fs.rm(managedRoot, { recursive: true, force: true });
    }
  });

  test('does not expose a source browser profile for copying unless cookie sync is enabled', async () => {
    const managedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-browser-launch-plan-'));
    try {
      const sourceCookiePath = path.join(managedRoot, 'source', 'Default', 'Network', 'Cookies');
      await fs.mkdir(path.dirname(sourceCookiePath), { recursive: true });
      await fs.writeFile(sourceCookiePath, '');
      const baseConfig = {
        auracallProfileName: 'work',
        target: 'chatgpt' as const,
        chromeCookiePath: sourceCookiePath,
        managedProfileRoot: managedRoot,
      };

      const defaultPlan = resolveBrowserLaunchPlan({
        source: { kind: 'session-config', config: baseConfig },
      });
      const optedInPlan = resolveBrowserLaunchPlan({
        source: { kind: 'session-config', config: { ...baseConfig, cookieSync: true } },
      });

      expect(defaultPlan.sourceBrowserProfile).toMatchObject({
        cookiePath: null,
        bootstrapCookiePath: null,
      });
      expect(optedInPlan.sourceBrowserProfile).toMatchObject({
        cookiePath: sourceCookiePath,
        bootstrapCookiePath: sourceCookiePath,
      });
    } finally {
      await fs.rm(managedRoot, { recursive: true, force: true });
    }
  });

  test('preserves browser launch validation errors at the public seam', () => {
    expect(() => resolveBrowserLaunchPlan({
      source: {
        kind: 'user-config',
        config: {
          model: 'Pro',
          browser: {
            target: 'chatgpt',
            chatgptUrl: 'https://chatgpt.com/?temporary-chat=true',
            modelStrategy: 'select',
          },
        } as never,
      },
    })).toThrow(
      'Temporary Chat mode does not expose Pro models in the ChatGPT model picker. ' +
        'Remove "temporary-chat=true" from your browser URL, or use a non-Pro model label (e.g. "Instant").',
    );
  });
});
