import './desktopControlRuntime.js';
import path from 'node:path';
import type { ResolvedUserConfig } from '../../config.js';
import { resolveBrowserLaunchPlan } from './browserLaunchPlan.js';
import type { ResolvedBrowserConfig } from '../types.js';
import type { BrowserProfileTarget } from '../profileStore.js';
import { matchesServiceUrl } from '../urlFamilies.js';
import { resolveBrowserListTarget, pruneRegistry } from './session.js';
import { launchManualLoginSession } from '../manualLogin.js';
import { getAuracallHomeDir } from '../../auracallHome.js';
import {
  scanRegisteredInstance,
  explainTabResolution,
  summarizeTabResolution,
  type TabDescriptor,
  type TabResolutionExplanation,
} from '../../../packages/browser-service/src/service/instanceScanner.js';
import {
  listInstancesWithLiveness,
  registerInstance,
  updateInstance,
  type BrowserInstanceLease,
  type BrowserInstanceOperation,
  type BrowserInstanceOwner,
} from '../../../packages/browser-service/src/service/stateRegistry.js';
import {
  collectDiscardedRegistryCandidates,
  type DiscardedRegistryCandidate as ServiceTargetDiscardedRegistryCandidate,
} from './registryDiagnostics.js';
import {
  findChromePidUsingUserDataDir,
  findChromeProcessUsingUserDataDir,
} from '../../../packages/browser-service/src/processCheck.js';
import {
  BrowserService as BrowserServiceCore,
  type BrowserServiceDependencies,
} from '../../../packages/browser-service/src/service/browserService.js';
import {
  createInMemoryBrowserMutationLog,
  type BrowserMutationAuditSink,
  type BrowserMutationRecord,
} from '../../../packages/browser-service/src/service/mutationDispatcher.js';
import type { BrowserOperationQueueObservationSummary } from '../operationQueueObservations.js';
import { summarizeBrowserOperationQueueObservations } from '../operationQueueObservations.js';
import { assertNoLiveNativeDesktopBrowser } from './nativeDesktopStore.js';
import { findNativeDesktopBrowser, launchNativeDesktopBrowser } from './nativeDesktopRuntime.js';
import { findConfiguredDesktopBrowser, launchAgentBrowserRdpSession } from './agentBrowserRdpLauncher.js';

type ServiceTargetMatchOptions = {
  serviceId: 'chatgpt' | 'grok' | 'gemini';
  configuredUrl?: string | null;
  ensurePort?: boolean;
  logger?: (message: string) => void;
  abortSignal?: AbortSignal;
  onStage?: (stage: string) => void;
};

export type BrowserProcessOwnerAttribution = {
  owner: BrowserInstanceOwner;
  operation: BrowserInstanceOperation;
  lease: BrowserInstanceLease;
};

export type ServiceTargetResolution = {
  host?: string;
  port?: number;
  browserProcessId?: number | null;
  browserProfile?: string | null;
  sourceBrowserProfile?: string | null;
  managedBrowserProfile?: string | null;
  tab?: TabDescriptor | null;
  tabs?: TabDescriptor[];
  tabSelection?: TabResolutionExplanation;
  discardedRegistryCandidates?: ServiceTargetDiscardedRegistryCandidate[];
};

export class BrowserService extends BrowserServiceCore {
  private static readonly mutationLogs = new Map<string, ReturnType<typeof createInMemoryBrowserMutationLog>>();
  private readonly registryPath: string;
  private readonly userConfig: ResolvedUserConfig;
  private readonly serviceTarget: BrowserProfileTarget;
  private readonly mutationLogKey: string;
  private constructor(
    userConfig: ResolvedUserConfig,
    target: BrowserProfileTarget,
    private readonly browserProcessOwner?: BrowserProcessOwnerAttribution,
  ) {
    const launchPlan = resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: userConfig },
      intent: { provider: target },
    });
    const resolvedConfig = structuredClone(launchPlan.launchPolicy) as ResolvedBrowserConfig;
    const registryPath = path.join(getAuracallHomeDir(), 'browser-state.json');
    const deps: BrowserServiceDependencies = {
      resolveBrowserListTarget: () => resolveBrowserListTarget(userConfig, target),
      resolveManagedProfileOwner: async (userDataDir) => {
        const owner = await findChromeProcessUsingUserDataDir(userDataDir);
        return owner
          ? {
              host: '127.0.0.1',
              port: owner.port ?? undefined,
              pid: owner.pid,
            }
          : null;
      },
      pruneRegistry: () => pruneRegistry(),
      launchManualLoginSession: resolvedConfig.agentBrowserRdp?.enabled
        ? (options) => launchAgentBrowserRdpSession({
            config: resolvedConfig,
            userDataDir: options.userDataDir,
            url: options.url,
            auracallRuntimeProfile: userConfig.auracallProfile ?? null,
            browserProfileId: launchPlan.selection.browserProfileId,
            serviceTarget: target,
            logger: options.logger,
            abortSignal: options.abortSignal,
            onStage: options.onStage,
          })
        : launchManualLoginSession,
    };
    super(resolvedConfig, deps);
    this.registryPath = registryPath;
    this.userConfig = userConfig;
    this.serviceTarget = target;
    this.mutationLogKey = resolveMutationLogKey(userConfig, target);
  }

  static fromConfig(
    userConfig: ResolvedUserConfig,
    target: BrowserProfileTarget = 'chatgpt',
    options?: { browserProcessOwner?: BrowserProcessOwnerAttribution },
  ): BrowserService {
    return new BrowserService(userConfig, target, options?.browserProcessOwner);
  }

  override getConfig(): ResolvedBrowserConfig {
    return super.getConfig() as ResolvedBrowserConfig;
  }

  getMutationAuditSink(): BrowserMutationAuditSink {
    return this.getMutationLog().record;
  }

  listRecentBrowserMutations(limit = 20): BrowserMutationRecord[] {
    const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 20;
    if (normalizedLimit <= 0) {
      return [];
    }
    return this.getMutationLog().list().slice(-normalizedLimit);
  }

  summarizeBrowserOperationQueue(limit = 20): BrowserOperationQueueObservationSummary {
    const launchContext = this.resolveLaunchContext(this.serviceTarget);
    return summarizeBrowserOperationQueueObservations({
      managedProfileDir: launchContext.managedBrowserProfile.directory,
      serviceTarget: this.serviceTarget,
    }, limit);
  }

  async resolveServiceTarget(
    options: ServiceTargetMatchOptions,
  ): Promise<ServiceTargetResolution> {
    const launchContext = this.resolveLaunchContext(options.serviceId);
		const selectionProvenance = {
			browserProfile: launchContext.selection.browserProfileId,
			sourceBrowserProfile: launchContext.sourceBrowserProfile.name,
			managedBrowserProfile: launchContext.managedBrowserProfile.directory,
		};
    let target = await this.resolveDevToolsTarget({
      host: undefined,
      port: undefined,
      ensurePort: options.ensurePort,
      launchUrl: options.configuredUrl ?? undefined,
      abortSignal: options.abortSignal,
      onStage: options.onStage,
    });
    if (!target.port) {
      return { host: target.host, port: target.port, ...selectionProvenance };
    }

    options.onStage?.('browserTargetClassification');
    const classifiedInstances = await listInstancesWithLiveness({ registryPath: this.registryPath });
    const expectedProfilePath = launchContext.managedBrowserProfile.directory;
    const expectedProfileName = launchContext.managedBrowserProfile.activeProfileName;
    let matchedByPort = classifiedInstances.find(({ instance, alive }) =>
      alive && instance.port === target.port && (target.host ? instance.host === target.host : true),
    )?.instance;
    const selectedPortProfileMismatch = matchedByPort
      ? !matchesManagedProfile(matchedByPort, expectedProfilePath, expectedProfileName)
      : false;
    if (matchedByPort && selectedPortProfileMismatch) {
      if (this.getConfig().agentBrowserRdp?.desktopName || this.getConfig().remoteViewDesktop) {
        throw new Error('Desktop-validated CDP endpoint conflicts with the managed browser registry; reconcile ownership before retrying.');
      }
      const expectedInstance = classifiedInstances.find(({ instance, alive }) =>
        alive && matchesManagedProfile(instance, expectedProfilePath, expectedProfileName),
      )?.instance;
      if (expectedInstance?.port) {
        if (options.logger) {
          options.logger(
            `[browser-service] Ignoring selected DevTools port ${target.port} because it belongs to ` +
              `${matchedByPort.profilePath ?? 'unknown'}::${matchedByPort.profileName ?? 'Default'}; ` +
              `using expected managed browser profile ${expectedProfilePath}::${expectedProfileName} ` +
              `on port ${expectedInstance.port}.`,
          );
        }
        target = {
          ...target,
          host: expectedInstance.host ?? target.host,
          port: expectedInstance.port,
        };
        matchedByPort = expectedInstance;
      } else {
        throw new Error(
          `Resolved DevTools port ${target.port} belongs to ${matchedByPort.profilePath ?? 'unknown'}::${matchedByPort.profileName ?? 'Default'}, ` +
            `not expected managed browser profile ${expectedProfilePath}::${expectedProfileName}. ` +
            'Refusing to use a cross-profile browser target.',
        );
      }
    }
    const targetPort = target.port;
    if (!targetPort) {
      return { host: target.host, port: target.port, ...selectionProvenance };
    }
    const profilePath = matchedByPort?.profilePath ?? expectedProfilePath;
    const profileName = matchedByPort?.profileName ?? expectedProfileName;
    const discardedRegistryCandidates = collectDiscardedRegistryCandidates({
      classifiedInstances,
      targetHost: target.host ?? '127.0.0.1',
      targetPort,
      expectedProfilePath,
      expectedProfileName,
    });
    if (options.logger && discardedRegistryCandidates.length > 0) {
      options.logger(
        `[browser-service] Discarded registry candidates: ${discardedRegistryCandidates
          .map((candidate) =>
            `${candidate.reason} ${candidate.profilePath}::${candidate.profileName} port=${candidate.port} host=${candidate.host} liveness=${candidate.liveness}${candidate.actualPid ? ` actualPid=${candidate.actualPid}` : ''}`,
          )
          .join('; ')}`,
      );
    }
    if (!matchedByPort && target.port) {
      const pid = await findChromePidUsingUserDataDir(profilePath);
      if (pid) {
        const now = new Date().toISOString();
        await registerInstance(
          { registryPath: this.registryPath },
          {
            pid,
            port: target.port,
            host: target.host ?? '127.0.0.1',
            profilePath,
            profileName,
            type: 'chrome',
            launchedAt: now,
            lastSeenAt: now,
            services: options.serviceId ? [options.serviceId] : undefined,
            ...this.browserProcessOwner,
          },
        );
      }
    }
    await this.attributeBrowserProcessOwner(profilePath, profileName, options.serviceId);
    const scan = await scanRegisteredInstance(
      { registryPath: this.registryPath },
      profilePath,
      profileName,
      options.logger,
      {},
    );
    if (scan?.instance && options.serviceId && options.logger) {
      const recorded = scan.instance.services;
      if (recorded && !recorded.includes(options.serviceId)) {
        options.logger(
          `[browser-service] Skipping service-affinity merge for ${profilePath}::${profileName} ` +
            'to avoid cross-provider registry contamination',
        );
      }
    }
    const configuredMatcher =
      options.serviceId === 'chatgpt' ? null : createConfiguredUrlMatcher(options.serviceId, options.configuredUrl);
    const serviceMatcher = (url: string) => matchesServiceUrl(options.serviceId, url);
    const matchUrl = configuredMatcher ?? serviceMatcher;
    const tabSelection = scan?.tabs ? explainTabResolution(scan.tabs, { matchUrl }) : undefined;
    if (options.logger && tabSelection) {
      options.logger(`[browser-service] ${summarizeTabResolution(tabSelection)}`);
    }
    return {
      host: target.host,
      port: target.port,
			browserProcessId: scan?.instance?.pid ?? matchedByPort?.pid ?? null,
			browserProfile: selectionProvenance.browserProfile,
			sourceBrowserProfile: selectionProvenance.sourceBrowserProfile,
			managedBrowserProfile: profilePath,
      tab: tabSelection?.tab ?? null,
      tabs: scan?.tabs,
      tabSelection,
      discardedRegistryCandidates,
    };
  }

  private async attributeBrowserProcessOwner(
    profilePath: string,
    profileName: string | null | undefined,
    serviceId: ServiceTargetMatchOptions['serviceId'],
  ): Promise<void> {
    if (!this.browserProcessOwner) return;
    const now = new Date().toISOString();
    await updateInstance(
      { registryPath: this.registryPath },
      profilePath,
      profileName,
      {
        owner: {
          ...this.browserProcessOwner.owner,
          heartbeatAt: now,
        },
        operation: this.browserProcessOwner.operation,
        lease: {
          ...this.browserProcessOwner.lease,
          heartbeatAt: now,
        },
        lastSeenAt: now,
        services: serviceId ? [serviceId] : undefined,
      },
    );
  }

  override async resolveDevToolsTarget(options: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
    defaultProfileDir?: string;
    abortSignal?: AbortSignal;
    onStage?: (stage: string) => void;
  } = {}) {
    const launchContext = this.resolveLaunchContext(this.serviceTarget);
    const fallbackDir = launchContext.managedBrowserProfile.directory;
    const config = this.getConfig();
    if (config.remoteViewDesktop) {
      const directory = options.defaultProfileDir ?? fallbackDir;
      const existing = await findNativeDesktopBrowser(config, directory);
      const explicitPort = options.port ?? config.remoteChrome?.port;
      const explicitHost = options.host ?? config.remoteChrome?.host;
      if ((explicitPort || explicitHost) && (!existing || (explicitPort && existing.cdpPort !== explicitPort) ||
        (explicitHost && existing.cdpHost !== explicitHost))) throw new Error('Explicit CDP endpoint does not belong to the configured native desktop.');
      if (existing) return { host: existing.cdpHost, port: existing.cdpPort, launched: false };
      if (!options.ensurePort) return { host: undefined, port: undefined, launched: false };
      const chrome = await launchNativeDesktopBrowser({ config, userDataDir: directory, logger: () => {}, abortSignal: options.abortSignal });
      return { host: chrome.host, port: chrome.port, launched: true };
    }
    if (config.agentBrowserRdp?.enabled && config.agentBrowserRdp.desktopName) {
      const remoteOptions = {
        config,
        userDataDir: options.defaultProfileDir ?? fallbackDir,
        url: options.launchUrl ?? 'about:blank',
        auracallRuntimeProfile: this.userConfig.auracallProfile ?? null,
        browserProfileId: launchContext.selection.browserProfileId,
        serviceTarget: this.serviceTarget,
        logger: () => undefined,
        abortSignal: options.abortSignal,
        onStage: options.onStage,
      };
      options.abortSignal?.throwIfAborted();
      const existing = await findConfiguredDesktopBrowser(remoteOptions);
      const explicit = options.port ?? config.remoteChrome?.port;
      const explicitHost = options.host ?? config.remoteChrome?.host;
      if (explicit && (!existing || existing.port !== explicit ||
        (explicitHost && existing.host !== explicitHost))) {
        throw new Error('Explicit CDP endpoint does not belong to the configured AuraCall desktop.');
      }
      if (existing) return { ...existing, launched: false };
      if (!options.ensurePort) return { host: undefined, port: undefined, launched: false };
      const result = await launchAgentBrowserRdpSession(remoteOptions);
      return { host: result.chrome.host, port: result.port, launched: true };
    }
    await assertNoLiveNativeDesktopBrowser(options.defaultProfileDir ?? fallbackDir, { host: options.host ?? config.remoteChrome?.host, port: options.port ?? config.remoteChrome?.port });
    return super.resolveDevToolsTarget({
      ...options,
      defaultProfileDir: options.defaultProfileDir ?? fallbackDir,
    });
  }

  private resolveLaunchContext(target: BrowserProfileTarget) {
    return resolveBrowserLaunchPlan({
      source: { kind: 'user-config', config: this.userConfig },
      intent: { provider: target },
    });
  }

  private getMutationLog(): ReturnType<typeof createInMemoryBrowserMutationLog> {
    let log = BrowserService.mutationLogs.get(this.mutationLogKey);
    if (!log) {
      log = createInMemoryBrowserMutationLog();
      BrowserService.mutationLogs.set(this.mutationLogKey, log);
    }
    return log;
  }
}

function resolveMutationLogKey(userConfig: ResolvedUserConfig, target: BrowserProfileTarget): string {
  const runtimeProfile = typeof userConfig.auracallProfile === 'string' && userConfig.auracallProfile.trim()
    ? userConfig.auracallProfile.trim()
    : 'default';
  return `auracall-runtime-profile:${runtimeProfile}::service:${target}`;
}

function matchesManagedProfile(
  instance: { profilePath?: string; profileName?: string },
  expectedProfilePath: string,
  expectedProfileName: string,
): boolean {
  if (!instance.profilePath) return false;
  const instanceProfileName = (instance.profileName ?? 'Default').trim().toLowerCase();
  return (
    path.resolve(instance.profilePath) === path.resolve(expectedProfilePath) &&
    instanceProfileName === expectedProfileName.trim().toLowerCase()
  );
}

function createConfiguredUrlMatcher(
  serviceId: ServiceTargetMatchOptions['serviceId'],
  configuredUrl: string | null | undefined,
): ((url: string) => boolean) | null {
  if (!configuredUrl) {
    return null;
  }
  try {
    const configured = new URL(configuredUrl);
    const configuredPath = normalizeConfiguredPath(configured.pathname);
    const configuredSearch = normalizeConfiguredSearch(configured.searchParams);
    return (url: string) => {
      try {
        const candidate = new URL(url);
        if (candidate.host !== configured.host) {
          return false;
        }
        if (serviceId === 'gemini' && isGeminiConversationRouteCompatible(configuredPath, candidate.pathname)) {
          if (!configured.search) {
            return true;
          }
          return normalizeConfiguredSearch(candidate.searchParams) === configuredSearch;
        }
        if (configuredPath === '/') {
          return true;
        }
        if (normalizeConfiguredPath(candidate.pathname) !== configuredPath) {
          return false;
        }
        if (!configured.search) {
          return true;
        }
        return normalizeConfiguredSearch(candidate.searchParams) === configuredSearch;
      } catch {
        return false;
      }
    };
  } catch {
    return (url: string) => url.includes(configuredUrl);
  }
}

function isGeminiConversationRouteCompatible(configuredPath: string, candidatePathname: string): boolean {
  if (configuredPath !== '/app') {
    return false;
  }
  const candidatePath = normalizeConfiguredPath(candidatePathname);
  return candidatePath === '/app' || /^\/app\/[^/]+$/i.test(candidatePath);
}

function normalizeConfiguredPath(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return trimmed.replace(/\/+$/, '') || '/';
}

function normalizeConfiguredSearch(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey);
      }
      return leftValue.localeCompare(rightValue);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
