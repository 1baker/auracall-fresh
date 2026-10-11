import { getRuntimeProfileBrowserProfile, resolveRuntimeSelection } from '../../config/model.js';
import type { ResolvedUserConfig } from '../../config.js';
import { DEFAULT_BROWSER_CONFIG, resolveBrowserConfig } from '../config.js';
import { resolveCookiePath } from './profile.js';
import {
  resolveBootstrapSourceCookiePath,
  resolveManagedProfileDir,
  resolveManagedProfileName,
} from '../profileStore.js';
import type {
  BrowserAutomationConfig,
  BrowserSessionConfig,
  ResolvedBrowserConfig,
} from '../types.js';
import type {
  ResolvedBrowserProfile,
  ResolvedBrowserProfileResolution,
  ResolvedServiceBinding,
} from './profileResolution.js';
import {
  resolveBrowserProfileResolution,
  resolveSelectedBrowserProfileResolution,
} from './profileResolution.js';

type ProviderId = 'chatgpt' | 'gemini' | 'grok';

const BROWSER_PROFILE_OWNED_FIELDS = [
  'browserFamily',
  'browserBuild',
  'agentBrowserRdp',
  'remoteViewDesktop',
  'desktop',
  'chromePath',
  'chromeProfile',
  'profilePath',
  'profileName',
  'sourceProfilePath',
  'sourceProfileName',
  'chromeCookiePath',
  'cookiePath',
  'sourceCookiePath',
  'bootstrapCookiePath',
  'display',
  'managedProfileRoot',
  'debugPort',
  'debugPortStrategy',
  'debugPortRange',
  'profileConflictAction',
  'blockingProfileAction',
  'remoteChrome',
  'headless',
  'hideWindow',
  'keepBrowser',
  'manualLogin',
  'manualLoginProfileDir',
  'wslChromePreference',
  'serviceTabLimit',
  'blankTabLimit',
  'collapseDisposableWindows',
] as const;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly [unknown, ...unknown[]]
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type BrowserLaunchSource =
  | Readonly<{
      kind: 'user-config';
      config: DeepReadonly<ResolvedUserConfig>;
    }>
  | Readonly<{
      kind: 'session-config';
      config: DeepReadonly<BrowserAutomationConfig>;
    }>;

export interface BrowserLaunchIntent {
  provider?: ProviderId;
  runtimeProfileId?: string | null;
  browserProfileId?: string | null;
  agentId?: string | null;
}

export type BrowserLaunchPlan = DeepReadonly<{
  selection: {
    auraCallRuntimeProfileId: string | null;
    browserProfileId: string | null;
    agentId: string | null;
  };
  browserProfile: ResolvedBrowserProfile;
  sourceBrowserProfile: {
    rootPath: string | null;
    name: string | null;
    cookiePath: string | null;
    bootstrapCookiePath: string | null;
  };
  managedBrowserProfile: {
    root: string;
    directory: string;
    defaultDirectory: string;
    configuredProfileName: string;
    activeProfileName: string;
  };
  providerBinding: Omit<ResolvedServiceBinding, 'serviceId'> & {
    provider: ProviderId;
  };
  launchPolicy: ResolvedBrowserConfig;
}>;

function clone<T>(value: T): T {
  return (typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))) as T;
}

function changesBrowserProfileSelection(input: {
  intent: BrowserLaunchIntent;
  configuredRuntimeProfileId: string | null;
  selectedRuntimeProfileId: string | null;
  selectedBrowserProfileId: string | null;
}): boolean {
  const explicitBrowserProfileId = input.intent.browserProfileId?.trim() || null;
  return (
    input.selectedRuntimeProfileId !== input.configuredRuntimeProfileId ||
    (explicitBrowserProfileId !== null && explicitBrowserProfileId !== input.selectedBrowserProfileId)
  );
}

function withoutStaleBrowserProfileFields(
  browser: BrowserAutomationConfig,
): BrowserAutomationConfig {
  const selected = { ...browser } as BrowserAutomationConfig & Record<string, unknown>;
  for (const field of BROWSER_PROFILE_OWNED_FIELDS) {
    delete selected[field];
  }
  return selected;
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as Partial<T>;
}

function withoutRuntimeAuthorization(
  browser: ResolvedBrowserConfig,
): ResolvedBrowserConfig {
  const launchPolicy = { ...browser };
  delete launchPolicy.providerSessionAuthorization;
  return launchPolicy;
}

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    freezeDeep(nested);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

function resolveManagedBrowserProfile(input: {
  runtimeProfileId: string | null;
  browserProfileId: string | null;
  provider: ProviderId;
  browser: ResolvedBrowserConfig;
}) {
  const namespace = input.browserProfileId ?? input.runtimeProfileId ?? 'default';
  const configuredProfileName = input.browser.chromeProfile ?? 'Default';
  const directory = resolveManagedProfileDir({
    configuredDir: input.browser.manualLoginProfileDir,
    managedProfileRoot: input.browser.managedProfileRoot,
    auracallProfileName: namespace,
    target: input.provider,
  });
  const defaultDirectory = resolveManagedProfileDir({
    configuredDir: null,
    managedProfileRoot: input.browser.managedProfileRoot,
    auracallProfileName: namespace,
    target: input.provider,
  });
  const activeProfileName = resolveManagedProfileName(directory, configuredProfileName);
  const sourceCookiePath = resolveBootstrapSourceCookiePath({
    configuredCookiePath: input.browser.cookieSync ? input.browser.chromeCookiePath : null,
    managedProfileDir: directory,
    managedProfileName: activeProfileName,
  });
  const bootstrapCookiePath = resolveBootstrapSourceCookiePath({
    configuredCookiePath:
      input.browser.bootstrapCookiePath ??
      (input.browser.cookieSync ? input.browser.chromeCookiePath : null),
    managedProfileDir: directory,
    managedProfileName: activeProfileName,
  });
  return {
    directory,
    defaultDirectory,
    configuredProfileName,
    activeProfileName,
    sourceCookiePath,
    bootstrapCookiePath,
  };
}

function resolveProviderBinding(input: {
  provider: ProviderId;
  resolution: ResolvedServiceBinding;
  browser: ResolvedBrowserConfig;
}): BrowserLaunchPlan['providerBinding'] {
  const { provider, resolution, browser } = input;
  return {
    ...clone(resolution),
    provider,
    serviceUrl: browser.url ?? resolution.serviceUrl,
    urls: {
      chatgpt: browser.chatgptUrl ?? resolution.urls.chatgpt,
      gemini: browser.geminiUrl ?? resolution.urls.gemini,
      grok: browser.grokUrl ?? resolution.urls.grok,
    },
    projectId: resolution.projectId ?? browser.projectId ?? undefined,
    conversationId: resolution.conversationId ?? browser.conversationId ?? undefined,
    model: resolution.model ?? browser.desiredModel ?? undefined,
    modelStrategy: resolution.modelStrategy ?? browser.modelStrategy,
    thinkingTime: resolution.thinkingTime ?? browser.thinkingTime,
    composerTool: resolution.composerTool ?? browser.composerTool ?? undefined,
    chatgptToolApproval:
      resolution.chatgptToolApproval ?? browser.chatgptToolApproval,
    deepResearchPlanAction:
      resolution.deepResearchPlanAction ?? browser.deepResearchPlanAction,
    manualLogin: browser.manualLogin,
    manualLoginProfileDir:
      browser.manualLogin === true
        ? browser.manualLoginProfileDir ?? undefined
        : undefined,
  };
}

export function resolveBrowserLaunchPlan(input: Readonly<{
  source: BrowserLaunchSource;
  intent?: BrowserLaunchIntent;
}>): BrowserLaunchPlan {
  const intent = input.intent ?? {};
  let provider: ProviderId;
  let runtimeProfileId: string | null;
  let resolvedConfig: ResolvedBrowserConfig;
  let resolution: ResolvedBrowserProfileResolution;
  let managedProfile: ReturnType<typeof resolveManagedBrowserProfile>;

  if (input.source.kind === 'user-config') {
    const userConfig = input.source.config as ResolvedUserConfig;
    const configuredBrowser = clone(userConfig.browser ?? {}) as BrowserAutomationConfig;
    const configuredRuntimeSelection = resolveRuntimeSelection(userConfig, {
      explicitProfileName: userConfig.auracallProfile ?? null,
    });
    const runtimeSelection = resolveRuntimeSelection(userConfig, {
      explicitProfileName: intent.runtimeProfileId ?? userConfig.auracallProfile ?? null,
      explicitAgentId: intent.agentId ?? null,
    });
    const selectedBrowser = changesBrowserProfileSelection({
      intent,
      configuredRuntimeProfileId: configuredRuntimeSelection.runtimeProfileId,
      selectedRuntimeProfileId: runtimeSelection.runtimeProfileId,
      selectedBrowserProfileId: runtimeSelection.browserProfileId,
    })
      ? withoutStaleBrowserProfileFields(configuredBrowser)
      : configuredBrowser;
    if (intent.provider && configuredBrowser.target && intent.provider !== configuredBrowser.target) {
      delete selectedBrowser.manualLoginProfileDir;
    }
    provider =
      intent.provider ??
      configuredBrowser.target ??
      runtimeSelection.defaultService ??
      'chatgpt';
    runtimeProfileId = runtimeSelection.runtimeProfileId ?? userConfig.auracallProfile ?? null;
    const runtimeProfile: Record<string, unknown> = {
      ...(runtimeSelection.runtimeProfile ?? {}),
      ...(intent.browserProfileId ? { browserProfile: intent.browserProfileId } : {}),
    };
    const runtimeServices = runtimeProfile.services as ResolvedUserConfig['services'] | undefined;
    const manualLogin = selectedBrowser.manualLogin ??
      runtimeServices?.[provider]?.manualLogin ?? userConfig.services?.[provider]?.manualLogin ??
      DEFAULT_BROWSER_CONFIG.manualLogin;
    const selected = resolveSelectedBrowserProfileResolution({
      merged: userConfig,
      browser: {
        ...selectedBrowser, target: provider,
        manualLogin,
      },
      explicitProfileName: runtimeProfileId,
      explicitAgentId: intent.agentId ?? null,
      runtimeProfile,
    });
    resolution = selected.resolution;
    // Resolve launch-owned fields here, before normalization, rather than letting
    // flattened global browser values or browser-profile defaults mask runtime intent.
    const runtimeBrowser = runtimeProfile.browser && typeof runtimeProfile.browser === 'object'
      ? runtimeProfile.browser as Record<string, unknown>
      : {};
    const browserProfile = getRuntimeProfileBrowserProfile(userConfig, runtimeProfile) ?? {};
    const launchFields = {
      chromePath: ['chromePath'],
      chromeProfile: ['sourceProfileName', 'profileName', 'chromeProfile'],
      chromeCookiePath: ['sourceCookiePath', 'cookiePath', 'chromeCookiePath'],
      bootstrapCookiePath: ['bootstrapCookiePath'],
      display: ['display'],
      managedProfileRoot: ['managedProfileRoot'],
      sourceProfilePath: ['sourceProfilePath', 'profilePath'],
    };
    const launchLayers = [runtimeBrowser, browserProfile, configuredBrowser as Record<string, unknown>];
    const launchOverrides: Record<string, string> = {};
    for (const [field, aliases] of Object.entries(launchFields)) {
      for (const layer of launchLayers) {
        const value = aliases.map((alias) => layer[alias]).find(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
        );
        if (value !== undefined) {
          launchOverrides[field] = value.trim();
          break;
        }
      }
    }
    if (!launchOverrides.chromeCookiePath && launchOverrides.sourceProfilePath) {
      const derivedCookiePath = resolveCookiePath(
        launchOverrides.sourceProfilePath, launchOverrides.chromeProfile ?? 'Default',
      );
      if (derivedCookiePath) launchOverrides.chromeCookiePath = derivedCookiePath;
    }
    const cookieSync = launchLayers
      .map((layer) => layer.cookieSync)
      .find((value): value is boolean => typeof value === 'boolean');
    const runtimeDirectory = runtimeBrowser.manualLoginProfileDir;
    if (typeof runtimeDirectory === 'string' && runtimeDirectory.trim().length > 0) {
      launchOverrides.manualLoginProfileDir = runtimeDirectory.trim();
    }
    resolution.browserProfile = {
      ...resolution.browserProfile,
      sourceProfilePath: launchOverrides.sourceProfilePath ?? resolution.browserProfile.sourceProfilePath,
      sourceProfileName: launchOverrides.chromeProfile ?? resolution.browserProfile.sourceProfileName,
    };
    const binding = resolution.serviceBinding;
    resolvedConfig = resolveBrowserConfig({
      ...selectedBrowser,
      ...withoutUndefined(resolution.launchProfile),
      ...launchOverrides,
      cookieSync: cookieSync ?? selectedBrowser.cookieSync,
      // A derived profile cookie path is not an explicit bootstrap request.
      // Normalization derives bootstrap from the chosen source only after opt-in.
      bootstrapCookiePath: launchOverrides.bootstrapCookiePath,
      target: provider,
      url: binding.serviceUrl ?? selectedBrowser.url,
      projectId: binding.projectId ?? selectedBrowser.projectId,
      conversationId: binding.conversationId ?? selectedBrowser.conversationId,
      desiredModel: binding.model ?? userConfig.model,
      modelStrategy: binding.modelStrategy as BrowserSessionConfig['modelStrategy'],
      thinkingTime: binding.thinkingTime as BrowserSessionConfig['thinkingTime'],
      composerTool: binding.composerTool ?? selectedBrowser.composerTool,
      chatgptToolApproval:
        binding.chatgptToolApproval as BrowserSessionConfig['chatgptToolApproval'],
      deepResearchPlanAction:
        binding.deepResearchPlanAction as BrowserSessionConfig['deepResearchPlanAction'],
    }, {
      auracallProfileName: runtimeProfileId,
      browserProfileName: intent.browserProfileId ?? resolution.profileFamily.browserProfileId,
    });
    managedProfile = resolveManagedBrowserProfile({
      runtimeProfileId,
      browserProfileId: intent.browserProfileId ?? resolution.profileFamily.browserProfileId,
      browser: resolvedConfig,
      provider,
    });
  } else {
    provider = intent.provider ?? input.source.config.target ?? 'chatgpt';
    resolvedConfig = resolveBrowserConfig({
      ...(input.source.config as BrowserAutomationConfig),
      target: provider,
    }, {
      auracallProfileName: input.source.config.auracallProfileName ?? null,
    });
    runtimeProfileId = input.source.config.auracallProfileName ?? null;
    resolution = resolveBrowserProfileResolution({
      merged: { browser: resolvedConfig },
      profileName: runtimeProfileId,
      profile: intent.browserProfileId ? { browserProfile: intent.browserProfileId } : {},
      browser: resolvedConfig,
    });
    managedProfile = resolveManagedBrowserProfile({
      runtimeProfileId,
      browserProfileId: intent.browserProfileId ?? resolution.profileFamily.browserProfileId,
      browser: resolvedConfig,
      provider,
    });
  }
  const copiedConfig = clone(withoutRuntimeAuthorization(resolvedConfig));
  const copiedBrowserProfile = clone(resolution.browserProfile);
  const providerBinding = resolveProviderBinding({
    provider,
    resolution: resolution.serviceBinding,
    browser: copiedConfig,
  });

  return freezeDeep({
    selection: {
      auraCallRuntimeProfileId:
        runtimeProfileId ?? resolution.profileFamily.profileName,
      browserProfileId:
        intent.browserProfileId ?? resolution.profileFamily.browserProfileId,
      agentId: intent.agentId ?? null,
    },
    browserProfile: copiedBrowserProfile,
    sourceBrowserProfile: {
      rootPath: copiedBrowserProfile.sourceProfilePath ?? null,
      name: copiedBrowserProfile.sourceProfileName ?? copiedConfig.chromeProfile ?? null,
      cookiePath: managedProfile.sourceCookiePath,
      bootstrapCookiePath: managedProfile.bootstrapCookiePath,
    },
    managedBrowserProfile: {
      root: copiedConfig.managedProfileRoot ?? '',
      directory: managedProfile.directory,
      defaultDirectory: managedProfile.defaultDirectory,
      configuredProfileName: managedProfile.configuredProfileName,
      activeProfileName: managedProfile.activeProfileName,
    },
    providerBinding,
    launchPolicy: copiedConfig,
  }) as BrowserLaunchPlan;
}
