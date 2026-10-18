import { describe, expect, it, vi } from 'vitest';
import { projectConfigModel } from '../../src/config/model.js';
import * as configModule from '../../src/config.js';
import { resolveConfig } from '../../src/schema/resolver.js';

describe('Config Resolver', () => {
  it('should resolve default values when no config/cli provided', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-5.1-pro', browser: {} },
      path: '/tmp/config.json',
      loaded: false,
    });

    const result = await resolveConfig({});

    expect(result.model).toBe('gpt-5.1-pro');
    expect(result.browser.headless).toBe(undefined);
  });

  it('should default browser runs through the durable ChatGPT fast selector when no model is configured', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { browser: {} } as any,
      path: '/tmp/config.json',
      loaded: false,
    });

    const result = await resolveConfig({ engine: 'browser' });

    expect(result.engine).toBe('browser');
    expect(result.model).toBe('gpt-5.6-sol');
  });

  it('should resolve legacy ChatGPT Pro Extended intent to the current Sol compatibility model', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { browser: {} } as any,
      path: '/tmp/config.json',
      loaded: false,
    });

    const result = await resolveConfig({ engine: 'browser', model: 'chatgpt:pro-extended' });

    expect(result.engine).toBe('browser');
    expect(result.model).toBe('gpt-5.6-sol');
  });

  it('should resolve semantic ChatGPT Sol High selector to the Sol compatibility model', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { browser: {} } as any,
      path: '/tmp/config.json',
      loaded: false,
    });

    const result = await resolveConfig({ engine: 'browser', model: 'chatgpt:sol-high' });

    expect(result.engine).toBe('browser');
    expect(result.model).toBe('gpt-5.6-sol');
  });

  it('should override defaults with file config', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({});

    expect(result.model).toBe('gpt-4');
    expect(result.browser.headless).toBe(true);
  });

  it('should honor defaultRuntimeProfile as the primary top-level selector key', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'work',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            defaultService: 'chatgpt',
          },
          work: {
            defaultService: 'grok',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({});

    expect(result.defaultRuntimeProfile).toBe('work');
    expect(result.auracallProfile).toBe('work');
    expect(result.browser.target).toBe('grok');
  });

  it('should override file config with CLI flags', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-4', browser: { headless: true } },
      path: '/tmp/config.json',
      loaded: true,
    });

    const cliOptions = {
      browserHeadless: false,
      model: 'gpt-5-pro',
    };

    const result = await resolveConfig(cliOptions);

    expect(result.model).toBe('gpt-5-pro');
    expect(result.browser.headless).toBe(false);
  });

  it('should override project-id from config with CLI flag', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: { model: 'gpt-5.2-pro', browser: { projectId: 'CONFIG_ID' } },
      path: '/tmp/config.json',
      loaded: true,
    });

    const cliOptions = {
      projectId: 'CLI_ID',
    };

    const result = await resolveConfig(cliOptions);

    expect(result.browser.projectId).toBe('CLI_ID');
  });

  it('should keep current browser service-scope CLI flags on the transitional root browser layer', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        model: 'gpt-5.2-pro',
        browser: {
          projectId: 'config-project-id',
          projectName: 'Config Project',
          conversationName: 'Config Conversation',
          conversationId: 'config-conversation',
          modelStrategy: 'select',
          thinkingTime: 'light',
          composerTool: 'web-search',
        },
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/',
            projectId: 'service-project-id',
            projectName: 'Service Project',
            conversationName: 'Service Conversation',
            conversationId: 'service-conversation',
            modelStrategy: 'current',
            thinkingTime: 'heavy',
            composerTool: 'deep-search',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      projectId: 'cli-project-id',
      projectName: 'CLI Project',
      conversationName: 'CLI Conversation',
      conversationId: 'cli-conversation',
      browserModelStrategy: 'ignore',
      browserThinkingTime: 'extended',
      browserComposerTool: 'canvas',
    });

    expect(result.browser.projectId).toBe('cli-project-id');
    expect(result.browser.projectName).toBe('CLI Project');
    expect(result.browser.conversationName).toBe('CLI Conversation');
    expect(result.browser.conversationId).toBe('cli-conversation');
    expect(result.browser.modelStrategy).toBe('ignore');
    expect(result.browser.thinkingTime).toBe('extended');
    expect(result.browser.composerTool).toBe('canvas');
  });

  it('should also mirror cli project selectors into the selected runtime-profile service block', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                projectId: 'config-project-id',
                projectName: 'Config Project',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      projectId: 'cli-project-id',
      projectName: 'CLI Project',
    });

    expect(result.browser.projectId).toBe('cli-project-id');
    expect(result.browser.projectName).toBe('CLI Project');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.projectId).toBe('cli-project-id');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.projectName).toBe('CLI Project');
  });

  it('should mirror transitional cli service aliases into bridge profiles without shadowing them', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        browserFamilies: {
          default: {},
        },
        profiles: {
          default: {
            browserFamily: 'default',
            defaultService: 'grok',
          },
          'auracall-grok-auto': {
            browserFamily: 'default',
            defaultService: 'grok',
          },
        },
        agents: {
          orchestrator: {
            runtimeProfile: 'auracall-grok-auto',
          },
        },
        teams: {
          solo: {
            agents: ['orchestrator'],
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      browserModelStrategy: 'select',
      projectId: 'cli-project-id',
    });
    const projected = projectConfigModel(result as any);

    expect(result.runtimeProfiles).toBeUndefined();
    expect(result.profiles?.default?.services?.grok?.projectId).toBe('cli-project-id');
    expect(projected.runtimeProfiles.map((profile) => profile.id)).toEqual([
      'auracall-grok-auto',
      'default',
    ]);
    expect(projected.teams.find((team) => team.id === 'solo')?.members[0]).toMatchObject({
      runtimeProfileId: 'auracall-grok-auto',
      browserProfileId: 'default',
      defaultService: 'grok',
    });
  });

  it('should preserve live-follow service desired state through config resolution', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          default: {
            browserFamily: 'default',
            defaultService: 'grok',
            services: {
              chatgpt: {
                identity: { email: 'operator@example.com' },
                liveFollow: {
                  enabled: true,
                  mode: 'metadata-first',
                  priority: 'background',
                  sweepMode: 'full_sweep',
                  materializationPolicy: 'full_missing_assets',
                  materializationAssetKinds: ['media', 'artifacts'],
                  materializationMaxItems: 25,
                  materializationRefreshSnapshot: true,
                  materializationForce: true,
                },
              },
              gemini: {
                identity: { email: 'operator@example.com' },
                liveFollow: {
                  enabled: true,
                  mode: 'metadata-first',
                  priority: 'background',
                },
              },
              grok: {
                identity: { email: 'operator@example.com' },
                liveFollow: {
                  enabled: true,
                  mode: 'metadata-first',
                  priority: 'background',
                },
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({});

    expect(result.profiles?.default?.services?.chatgpt?.liveFollow).toEqual({
      enabled: true,
      mode: 'metadata-first',
      priority: 'background',
      sweepMode: 'full_sweep',
      materializationPolicy: 'full_missing_assets',
      materializationAssetKinds: ['media', 'artifacts'],
      materializationMaxItems: 25,
      materializationRefreshSnapshot: true,
      materializationForce: true,
    });
    expect(result.profiles?.default?.services?.gemini?.liveFollow).toEqual({
      enabled: true,
      mode: 'metadata-first',
      priority: 'background',
    });
    expect(result.profiles?.default?.services?.grok?.liveFollow).toEqual({
      enabled: true,
      mode: 'metadata-first',
      priority: 'background',
    });
  });

  it('should also mirror cli conversation selectors into the selected runtime-profile service block', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                conversationId: 'config-conversation-id',
                conversationName: 'Config Conversation',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      conversationId: 'cli-conversation-id',
      conversationName: 'CLI Conversation',
    });

    expect(result.browser.conversationId).toBe('cli-conversation-id');
    expect(result.browser.conversationName).toBe('CLI Conversation');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.conversationId).toBe(
      'cli-conversation-id',
    );
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.conversationName).toBe(
      'CLI Conversation',
    );
  });

  it('should leave project selectors on the root browser layer when no concrete default service exists', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      projectId: 'cli-project-id',
      projectName: 'CLI Project',
    });

    expect(result.browser.projectId).toBe('cli-project-id');
    expect(result.browser.projectName).toBe('CLI Project');
    expect(result.runtimeProfiles?.default?.services).toBeUndefined();
  });

  it('should leave conversation selectors on the root browser layer when no concrete default service exists', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      conversationId: 'cli-conversation-id',
      conversationName: 'CLI Conversation',
    });

    expect(result.browser.conversationId).toBe('cli-conversation-id');
    expect(result.browser.conversationName).toBe('CLI Conversation');
    expect(result.runtimeProfiles?.default?.services).toBeUndefined();
  });

  it('should also mirror cli browser service knobs into the selected runtime-profile service block', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                modelStrategy: 'current',
                thinkingTime: 'light',
                composerTool: 'web-search',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      browserModelStrategy: 'ignore',
      browserChatgptMode: 'work',
      browserChatgptToolApproval: 'always-allow',
      browserWorkModel: 'Research',
      browserThinkingTime: 'extended',
      browserComposerTool: 'canvas',
      browserDeepResearchPlanAction: 'edit',
    });

    expect(result.browser.modelStrategy).toBe('ignore');
    expect(result.browser.chatgptMode).toBe('work');
    expect(result.browser.chatgptToolApproval).toBe('always-allow');
    expect(result.browser.workModel).toBe('Research');
    expect(result.browser.thinkingTime).toBe('extended');
    expect(result.browser.composerTool).toBe('canvas');
    expect(result.browser.deepResearchPlanAction).toBe('edit');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.modelStrategy).toBe('ignore');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.chatgptMode).toBe('work');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.chatgptToolApproval).toBe('always-allow');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.workModel).toBe('Research');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.thinkingTime).toBe('extended');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.composerTool).toBe('canvas');
    expect(result.runtimeProfiles?.default?.services?.chatgpt?.deepResearchPlanAction).toBe('edit');
  });

  it('should leave browser service knobs on the root browser layer when no concrete default service exists', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      browserModelStrategy: 'ignore',
      browserChatgptMode: 'work',
      browserWorkModel: 'Research',
      browserThinkingTime: 'extended',
      browserComposerTool: 'canvas',
      browserDeepResearchPlanAction: 'edit',
    });

    expect(result.browser.modelStrategy).toBe('ignore');
    expect(result.browser.chatgptMode).toBe('work');
    expect(result.browser.workModel).toBe('Research');
    expect(result.browser.thinkingTime).toBe('extended');
    expect(result.browser.composerTool).toBe('canvas');
    expect(result.browser.deepResearchPlanAction).toBe('edit');
    expect(result.runtimeProfiles?.default?.services).toBeUndefined();
  });

  it('should apply selected v2 profile browser overrides over browserDefaults', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        auracallProfile: 'wsl-chrome-2',
        browserDefaults: {
          chromePath: '/usr/bin/google-chrome',
          chromeCookiePath: '/home/ecochran76/.config/google-chrome/Default/Cookies',
          bootstrapCookiePath: '/home/ecochran76/.config/google-chrome/Default/Cookies',
          managedProfileRoot: '/home/ecochran76/.auracall/browser-profiles',
          wslChromePreference: 'wsl',
          debugPort: 45011,
          serviceTabLimit: 3,
          blankTabLimit: 1,
          collapseDisposableWindows: true,
        },
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          'windows-chrome-test': {
            engine: 'browser',
            defaultService: 'grok',
            browser: {
              chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
              chromeCookiePath:
                '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
              bootstrapCookiePath:
                '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
              managedProfileRoot: '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
              wslChromePreference: 'windows',
              debugPort: 45920,
              serviceTabLimit: 5,
              blankTabLimit: 0,
              collapseDisposableWindows: false,
            },
            services: {
              grok: {
                manualLoginProfileDir:
                  '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'windows-chrome-test' });

    expect(result.auracallProfile).toBe('windows-chrome-test');
    expect(result.browser.chromePath).toBe(
      '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    );
    expect(result.browser.chromeCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    );
    expect(result.browser.bootstrapCookiePath).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies',
    );
    expect(result.browser.managedProfileRoot).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles',
    );
    expect(result.browser.wslChromePreference).toBe('windows');
    expect(result.browser.manualLoginProfileDir).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
    );
    expect(result.browser.debugPort).toBe(45920);
    expect(result.browser.serviceTabLimit).toBe(5);
    expect(result.browser.blankTabLimit).toBe(0);
    expect(result.browser.collapseDisposableWindows).toBe(false);
  });

  it('should keep CLI browser overrides above selected profile overrides', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        auracallProfile: 'wsl-chrome-2',
        browserDefaults: {
          chromePath: '/usr/bin/google-chrome',
        },
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          'windows-chrome-test': {
            engine: 'browser',
            defaultService: 'grok',
            browser: {
              chromePath: '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
              wslChromePreference: 'windows',
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      profile: 'windows-chrome-test',
      browserChromePath: '/custom/chrome',
      browserWslChrome: 'wsl',
    });

    expect(result.auracallProfile).toBe('windows-chrome-test');
    expect(result.browser.chromePath).toBe('/custom/chrome');
    expect(result.browser.wslChromePreference).toBe('wsl');
  });

  it('should apply named browser-family defaults for the selected profile', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        browserDefaults: {
          chromePath: '/usr/bin/google-chrome-stable',
        },
        browserFamilies: {
          'wsl-chrome-2': {
            chromePath: '/usr/bin/google-chrome',
            display: ':0.0',
            profilePath: '/home/test/.config/google-chrome',
            profileName: 'Default',
            cookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
            bootstrapCookiePath: '/home/test/.config/google-chrome/Default/Network/Cookies',
            managedProfileRoot: '/home/test/.auracall/browser-profiles',
            wslChromePreference: 'wsl',
          },
        },
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          'wsl-chrome-2': {
            defaultService: 'chatgpt',
            browserFamily: 'wsl-chrome-2',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'wsl-chrome-2' });

    expect(result.auracallProfile).toBe('wsl-chrome-2');
    expect(result.browser.chromePath).toBe('/usr/bin/google-chrome');
    expect(result.browser.display).toBe(':0.0');
    expect(result.browser.chromeCookiePath).toBe(
      '/home/test/.config/google-chrome/Default/Network/Cookies',
    );
    expect(result.browser.bootstrapCookiePath).toBe(
      '/home/test/.config/google-chrome/Default/Network/Cookies',
    );
    expect(result.browser.managedProfileRoot).toBe('/home/test/.auracall/browser-profiles');
    expect(result.browser.wslChromePreference).toBe('wsl');
    expect(result.browser.manualLoginProfileDir).toBe(
      '/home/test/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
    );
  });

  it('should use profile-specific service URLs for browser targets', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          personal: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                url: 'https://chatgpt.com/',
              },
            },
          },
          work: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                url: 'https://chatgpt.com/g/p-123456789',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'work' });

    expect(result.auracallProfile).toBe('work');
    expect(result.browser.chatgptUrl).toBe('https://chatgpt.com/g/p-123456789');
  });

  it('should resolve CLI-selected service target to profile service config', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        profiles: {
          mixed: {
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/mixed/chatgpt',
              },
              grok: {
                url: 'https://grok.com/preview',
                manualLoginProfileDir: '/tmp/mixed/grok',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({
      profile: 'mixed',
      engine: 'browser',
      browserTarget: 'grok',
    });

    expect(result.auracallProfile).toBe('mixed');
    expect(result.browser.target).toBe('grok');
    expect(result.browser.grokUrl).toBe('https://grok.com/preview');
    expect(result.browser.manualLoginProfileDir).toBe('/tmp/mixed/grok');
  });

  it('should resolve target-shape runtimeProfiles/browserProfiles with target precedence over bridge keys', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 2,
        model: 'gpt-5.2-pro',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        browserFamilies: {
          work: {
            chromePath: '/bridge/chrome',
          },
        },
        browserProfiles: {
          work: {
            chromePath: '/target/chrome',
          },
        },
        profiles: {
          work: {
            browserFamily: 'bridge-work',
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                url: 'https://chatgpt.com/g/p-bridge',
              },
            },
          },
        },
        runtimeProfiles: {
          work: {
            browserProfile: 'work',
            defaultService: 'grok',
            services: {
              grok: {
                url: 'https://grok.com/target',
              },
            },
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'work', engine: 'browser' });

    expect(result.auracallProfile).toBe('work');
    expect(result.browser.target).toBe('grok');
    expect(result.browser.chromePath).toBe('/target/chrome');
    expect(result.browser.grokUrl).toBe('https://grok.com/target');
  });

  it('should resolve an explicit agent selection through its AuraCall runtime profile', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome-stable',
          },
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserProfile: 'consulting',
            defaultService: 'grok',
            services: {
              grok: {
                url: 'https://grok.com/work',
              },
            },
          },
        },
        agents: {
          analyst: {
            runtimeProfile: 'work',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ agent: 'analyst', engine: 'browser' });

    expect(result.defaultRuntimeProfile).toBe('work');
    expect(result.auracallProfile).toBe('work');
    expect(result.browser.target).toBe('grok');
    expect(result.browser.chromePath).toBe('/usr/bin/google-chrome');
    expect(result.browser.grokUrl).toBe('https://grok.com/work');
  });

  it('should keep explicit runtime profile selection above explicit agent selection', async () => {
    vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
      config: {
        version: 3,
        defaultRuntimeProfile: 'default',
        browser: {},
        services: {
          chatgpt: { url: 'https://chatgpt.com/' },
          gemini: { url: 'https://gemini.google.com/app' },
          grok: { url: 'https://grok.com/' },
        },
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome-stable',
          },
          consulting: {
            chromePath: '/usr/bin/google-chrome',
          },
        },
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
          },
          work: {
            browserProfile: 'consulting',
            defaultService: 'grok',
          },
        },
        agents: {
          analyst: {
            runtimeProfile: 'work',
          },
        },
      } as any,
      path: '/tmp/config.json',
      loaded: true,
    });

    const result = await resolveConfig({ profile: 'default', agent: 'analyst', engine: 'browser' });

    expect(result.defaultRuntimeProfile).toBe('default');
    expect(result.auracallProfile).toBe('default');
    expect(result.browser.target).toBe('chatgpt');
    expect(result.browser.chromePath).toBe('/usr/bin/google-chrome-stable');
  });
});

it('retains configured shared backend ceilings and waiting through the real resolver', async () => {
 const spy = vi.spyOn(configModule, 'loadUserConfig').mockResolvedValue({
  config: {
   services: { chatgpt: { maxBackendRequestsPerMinute: 30, backendRequestBudgetWaitMs: 600000 } },
   profiles: { fixture: { browser: { tabConcurrencyMode: 'tab-affinity' }, services: { chatgpt: { maxBackendRequestsPerMinute: 12, backendRequestBudgetWaitMs: 120000 } } } },
  } as never,
  path: '/tmp/config.json', loaded: true,
 });
 try {
  const result = await resolveConfig({ profile: 'fixture', browserTarget: 'chatgpt' });
  expect(result.services?.chatgpt).toMatchObject({ maxBackendRequestsPerMinute: 30, backendRequestBudgetWaitMs: 600000 });
  const { resolveChatgptBackendRequestsPerMinute, resolveChatgptBackendRequestBudgetWaitMs } = await import('../../src/runtime/tenantExecutionLimits.js');
  expect(resolveChatgptBackendRequestsPerMinute(result, 'fixture')).toBe(12);
  expect(resolveChatgptBackendRequestBudgetWaitMs(result, 'fixture')).toBe(120000);
 } finally { spy.mockRestore(); }
});
