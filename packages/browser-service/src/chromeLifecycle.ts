import { rm, mkdir } from 'node:fs/promises';
import { appendFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import CDP from './guardedCdp.js';
import { Launcher, type LaunchedChrome } from 'chrome-launcher';
import type { BrowserLogger, ResolvedBrowserConfig, ChromeClient } from './types.js';
import { cleanupStaleProfileState, quarantineColdManagedProfileSessions, readDevToolsPort, readChromePid, writeDevToolsActivePort } from './profileState.js';
import {
  findChromePidUsingUserDataDir,
  findChromeProcessUsingUserDataDir,
  findResponsiveWindowsDevToolsPortForUserDataDir,
  isDevToolsResponsive,
  isPortOpen,
  probeWindowsLocalDevToolsPort,
} from './processCheck.js';
import { isWindowsPath, isWslEnvironment, toWindowsPath } from './platformPaths.js';
import {
  findActiveInstance,
  registerInstance,
  unregisterInstanceIfMatches,
  type BrowserInstanceGeneration,
} from './service/stateRegistry.js';
import { resolveProfileDirectoryName } from './service/profile.js';
import {
  DEFAULT_DEBUG_PORT,
  DEFAULT_DEBUG_PORT_RANGE,
  pickAvailableDebugPort,
} from './portSelection.js';
import {
  ensureDetachedWindowsLoopbackRelay,
  isWindowsLoopbackRemoteHost,
  resolveChromeEndpoint,
  resolveWindowsPowerShellPath,
  WINDOWS_LOOPBACK_REMOTE_HOST,
} from './windowsLoopbackRelay.js';
import { beginBrowserMutation, type BrowserMutationAuditSink } from './service/mutationDispatcher.js';
import type {
  ProviderTrafficAction,
  ProviderTrafficAuthorityFactory,
  ProviderTrafficGovernor,
} from './service/providerTrafficGovernor.js';

const execFileAsync = promisify(execFile);
const WINDOWS_WSL_DISCOVERY_ATTEMPTS = 40;
const WINDOWS_WSL_DISCOVERY_DELAY_MS = 250;
const DEFAULT_CDP_LIST_TIMEOUT_MS = 5_000;
const DEFAULT_CDP_CONNECTION_TIMEOUT_MS = 10_000;
type ManagedChromeHandle = LaunchedChrome & { host?: string; launchedByAuracall?: boolean };

function readAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('Browser launch aborted.');
}

export interface OwnedBrowserReadinessState {
  processId?: number;
  exitCode?: number | null;
  exitSignal?: string | null;
  profileDirectory?: string;
}

export class BrowserDebuggerReadinessError extends Error {
  readonly code: 'BROWSER_PROCESS_EXITED_BEFORE_CDP' | 'BROWSER_CDP_NOT_READY';
  readonly recoveryAction = 'inspect_browser_launch_diagnostics';
  readonly processId?: number;
  readonly exitCode?: number | null;
  readonly exitSignal?: string | null;
  readonly profileDirectory?: string;

  constructor(host: string, port: number, state?: OwnedBrowserReadinessState) {
    const exited = state?.exitCode != null || state?.exitSignal != null;
    super(`Chrome DevTools ${host}:${port} did not become ready. ` +
      (exited ? 'The owned browser process exited before readiness. ' : 'Browser exit is not proven. ') +
      'Inspect browser launch diagnostics before retrying through AuraCall; do not restart an unverified browser owner.');
    this.name = 'BrowserDebuggerReadinessError';
    this.code = exited ? 'BROWSER_PROCESS_EXITED_BEFORE_CDP' : 'BROWSER_CDP_NOT_READY';
    this.processId = state?.processId;
    this.exitCode = state?.exitCode;
    this.exitSignal = state?.exitSignal;
    this.profileDirectory = state?.profileDirectory;
  }
}

export async function probeChromeDebuggerPort(options: {
  host: string;
  port: number;
  abortSignal?: AbortSignal;
  probe?: (host: string, port: number) => Promise<boolean>;
  readOwnedProcessState?: () => OwnedBrowserReadinessState;
}): Promise<void> {
  const { abortSignal } = options;
  abortSignal?.throwIfAborted();
  const probe = options.probe ?? isPortOpen;
  let onAbort: (() => void) | null = null;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    if (!abortSignal) return;
    onAbort = () => reject(readAbortReason(abortSignal));
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    const ready = await Promise.race([
      Promise.resolve().then(() => probe(options.host, options.port)),
      abortPromise,
    ]);
    abortSignal?.throwIfAborted();
    if (!ready) {
      throw new BrowserDebuggerReadinessError(options.host, options.port, options.readOwnedProcessState?.());
    }
  } finally {
    if (onAbort && abortSignal) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
}

export async function runAbortableBrowserLaunch<T>(options: {
  launch: () => Promise<T>;
  cleanup: () => Promise<void> | void;
  abortSignal?: AbortSignal;
}): Promise<T> {
  const { abortSignal } = options;
  if (!abortSignal) {
    return options.launch();
  }

  let cleanupPromise: Promise<void> | null = null;
  const cleanupOnce = (): Promise<void> => {
    cleanupPromise ??= Promise.resolve().then(options.cleanup);
    return cleanupPromise;
  };
  if (abortSignal.aborted) {
    await cleanupOnce().catch(() => undefined);
    throw readAbortReason(abortSignal);
  }

  const launchPromise = Promise.resolve().then(() => {
    abortSignal.throwIfAborted();
    return options.launch();
  });
  let onAbort: (() => void) | null = null;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void cleanupOnce()
        .catch(() => undefined)
        .then(() => launchPromise.then(() => undefined, () => undefined))
        .then(() => reject(readAbortReason(abortSignal)));
    };
    abortSignal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    const result = await Promise.race([launchPromise, abortPromise]);
    if (abortSignal.aborted) {
      await cleanupOnce().catch(() => undefined);
      await launchPromise.then(() => undefined, () => undefined);
      throw readAbortReason(abortSignal);
    }
    return result;
  } catch (error) {
    if (abortSignal.aborted) {
      await cleanupOnce().catch(() => undefined);
      await launchPromise.then(() => undefined, () => undefined);
      throw readAbortReason(abortSignal);
    }
    throw error;
  } finally {
    if (onAbort) {
      abortSignal.removeEventListener('abort', onAbort);
    }
  }
}

export async function launchChrome(
  config: ResolvedBrowserConfig,
  userDataDir: string,
  logger: BrowserLogger,
  options: {
    registryPath?: string;
    onWindowsRetry?: (context: { failedPort: number; nextPort: number; attempt: number }) => Promise<void>;
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
    abortSignal?: AbortSignal;
    onStage?: (stage: string) => void;
    suppressStartupWindow?: boolean;
    launchEnvironment?: NodeJS.ProcessEnv;
  } = {},
) {
  options.abortSignal?.throwIfAborted();
  const registryOptions = options.registryPath ? { registryPath: options.registryPath } : null;
  const resolvedProfileName = resolveProfileDirectoryName(userDataDir, config.chromeProfile ?? 'Default');
  const windowsChromeFromWsl = isWindowsHostedChromePath(config.chromePath ?? undefined);
  logger(`Using Chrome profile directory "${resolvedProfileName}" in ${userDataDir}.`);
  // 1. Check persistent registry first
  options.onStage?.('browserChromeRegistryLookup');
  const registered = registryOptions
    ? await findActiveInstance(registryOptions, userDataDir, resolvedProfileName)
    : null;
  if (registered) {
    if (isCurrentRunOwnedChrome(registered.pid, registered.port, options)) {
      logger(
        `Found active Chrome instance in registry (pid ${registered.pid}, port ${registered.port}) started by this run; reusing with cleanup ownership.`,
      );
      return createAdoptedChromeHandle({
        pid: registered.pid,
        port: registered.port,
        host: registered.host,
        logger,
        registryOptions,
        profilePath: userDataDir,
        profileName: resolvedProfileName,
        windowsChromeFromWsl,
        skipShutdown: false,
        registeredGeneration: {
          pid: registered.pid,
          port: registered.port,
          launchedAt: registered.launchedAt,
        },
      });
    }
    logger(`Found active Chrome instance in registry (pid ${registered.pid}, port ${registered.port}); reusing.`);
    return createAdoptedChromeHandle({
      pid: registered.pid,
      port: registered.port,
      host: registered.host,
      logger,
      registryOptions,
      profilePath: userDataDir,
      profileName: resolvedProfileName,
      windowsChromeFromWsl,
      skipShutdown: true,
    });
  }

  // 2. Legacy Fallback: check if this profile is already active via OS/FS
  options.onStage?.('browserChromeProcessInspection');
  const existingProcess = await findChromeProcessUsingUserDataDir(userDataDir);
  const existingPid = existingProcess?.pid ?? null;
  if (existingPid) {
    const managedProfileRoot = config.managedProfileRoot
      ? path.resolve(config.managedProfileRoot)
      : null;
    const isManagedProfile = managedProfileRoot
      ? path.resolve(userDataDir).startsWith(managedProfileRoot + path.sep)
      : false;
    const blockingAction = config.blockingProfileAction ?? 'restart-managed';
    const requestedProfile = resolvedProfileName.trim();
    const isDefaultProfile = requestedProfile.toLowerCase() === 'default';
    const activePort = windowsChromeFromWsl
      ? await discoverWindowsChromeDevToolsPort({
          userDataDir,
          requestedPort: existingProcess?.port ?? null,
          pid: existingPid,
          logger,
        })
      : await readDevToolsPort(userDataDir) ?? existingProcess?.port ?? null;
    const probeHost = resolveRemoteDebugHost(config.chromePath ?? undefined) || '127.0.0.1';
    if (activePort && await isDevToolsResponsive({ host: probeHost, port: activePort })) {
      const runtimeHost = await ensurePersistentDevToolsEndpoint(activePort, probeHost, logger);
      if (isDefaultProfile) {
        if (isCurrentRunOwnedChrome(existingPid, activePort, options)) {
          logger(
            `Found running Chrome using profile ${userDataDir} on port ${activePort} started by this run; re-adopting with cleanup ownership.`,
          );
          if (registryOptions) {
            const launchedAt = new Date().toISOString();
            await registerInstance(registryOptions, {
              pid: existingPid,
              port: activePort,
              host: runtimeHost,
              profilePath: userDataDir,
              profileName: resolvedProfileName,
              type: 'chrome',
              launchedAt,
              lastSeenAt: launchedAt,
            });
            return createAdoptedChromeHandle({
              pid: existingPid,
              port: activePort,
              host: runtimeHost,
              logger,
              registryOptions,
              profilePath: userDataDir,
              profileName: resolvedProfileName,
              windowsChromeFromWsl,
              skipShutdown: false,
              registeredGeneration: { pid: existingPid, port: activePort, launchedAt },
            });
          }
          return createAdoptedChromeHandle({
            pid: existingPid,
            port: activePort,
            host: runtimeHost,
            logger,
            registryOptions,
            profilePath: userDataDir,
            profileName: resolvedProfileName,
            windowsChromeFromWsl,
            skipShutdown: false,
          });
        }
        logger(`Found running Chrome using profile ${userDataDir} on port ${activePort} (not in registry); adopting.`);
        if (registryOptions) {
          await registerInstance(registryOptions, {
            pid: existingPid,
            port: activePort,
            host: runtimeHost,
            profilePath: userDataDir,
            profileName: resolvedProfileName,
            type: 'chrome',
            launchedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        }
        return createAdoptedChromeHandle({
          pid: existingPid,
          port: activePort,
          host: runtimeHost,
          logger,
          registryOptions,
          profilePath: userDataDir,
          profileName: resolvedProfileName,
          windowsChromeFromWsl,
          skipShutdown: true,
        });
      }
      if (blockingAction === 'fail' || (blockingAction === 'restart-managed' && !isManagedProfile)) {
        throw new Error(
          `Chrome is already running with profile ${userDataDir}, but the automation needs profile "${requestedProfile}". ` +
          `Close Chrome and retry so it can launch the correct profile.`,
        );
      }
      logger(
        `Chrome is running with profile ${userDataDir} but "${requestedProfile}" was requested; restarting to ensure the correct profile.`,
      );
      await terminateChromeProcess(existingPid, logger);
    }
    if (blockingAction === 'fail' || (blockingAction === 'restart-managed' && !isManagedProfile)) {
      throw new Error(
        `Chrome is already running with profile ${userDataDir}, but DevTools is not enabled. ` +
        `Close Chrome and retry so it can relaunch with remote debugging enabled.`,
      );
    }
    if (!isManagedProfile && blockingAction === 'restart') {
      logger(`Forcing restart of user-managed Chrome profile ${userDataDir} (blockingProfileAction=restart).`);
    }
    logger(`Chrome (pid ${existingPid}) is running with profile ${userDataDir} but DevTools port is unreachable. Killing it to release lock.`);
    await terminateChromeProcess(existingPid, logger);
  }

  const launchEnvironment = { ...process.env, ...options.launchEnvironment };
  if (!config.headless && process.platform === 'linux') {
    const overrideDisplay =
      config.display ?? process.env.BROWSER_SERVICE_BROWSER_DISPLAY ?? process.env.AURACALL_BROWSER_DISPLAY;
    if (overrideDisplay) {
      launchEnvironment.DISPLAY = overrideDisplay;
      logger(`DISPLAY override set to ${overrideDisplay}.`);
    } else {
      const display = launchEnvironment.DISPLAY;
      if (!display || display === '0' || display === '0.0' || display === ':0' || display === ':0.0') {
        launchEnvironment.DISPLAY = ':0.0';
        logger('DISPLAY not set; defaulting to :0.0 for Chrome launch.');
      }
    }
    if (!launchEnvironment.XAUTHORITY) {
      const fallback = path.join(os.homedir(), '.Xauthority');
      if (existsSync(fallback)) {
        launchEnvironment.XAUTHORITY = fallback;
        logger(`XAUTHORITY not set; using ${fallback}.`);
      }
    }
  }
  const minimalFlags = Boolean(config.manualLogin);
  const managedProfileRootForCleanup = config.managedProfileRoot
    ? path.resolve(config.managedProfileRoot)
    : null;
  const isManagedProfileForCleanup = managedProfileRootForCleanup
    ? path.resolve(userDataDir).startsWith(managedProfileRootForCleanup + path.sep)
    : false;
  options.onStage?.('browserChromeProfileCleanup');
  await cleanupStaleProfileState(userDataDir, logger, {
    lockRemovalMode: isManagedProfileForCleanup ? 'if_recorded_pid_dead' : 'never',
  });
  if (managedProfileRootForCleanup) {
    const backup = await quarantineColdManagedProfileSessions({
      userDataDir,
      profileName: resolvedProfileName,
      managedProfileRoot: managedProfileRootForCleanup,
    });
    if (backup) logger(`Quarantined persisted browser session inputs: ${backup}`);
  }
  const probeHost = resolveRemoteDebugHost(config.chromePath ?? undefined);
  const debugBindAddress =
    probeHost && probeHost !== '127.0.0.1' && !isWindowsLoopbackRemoteHost(probeHost) ? '0.0.0.0' : undefined;
  const requestedDebugPort = config.debugPort ?? parseDebugPortEnv();
  const useAutoDebugPort = windowsChromeFromWsl && config.debugPortStrategy === 'auto';
  const debugPort = useAutoDebugPort
    ? 0
    : windowsChromeFromWsl
      ? await pickAvailableDebugPort(
          requestedDebugPort ?? DEFAULT_DEBUG_PORT,
          logger,
          config.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE,
        )
      : requestedDebugPort;
  const chromeFlags = buildChromeFlags(
    config.headless ?? false,
    debugBindAddress,
    resolvedProfileName ?? undefined,
    {
      minimal: minimalFlags,
      startMinimized: !config.headless && config.hideWindow,
      suppressStartupWindow: options.suppressStartupWindow,
    },
  );
  const bypassUserDataDir = shouldBypassLauncherUserDataDir(config.chromePath ?? undefined);
  const userDataDirFlag = `--user-data-dir=${resolveUserDataDirFlag(userDataDir, config.chromePath ?? undefined)}`;
  const effectiveChromeFlags =
    bypassUserDataDir && !chromeFlags.some((flag) => flag.startsWith('--user-data-dir='))
      ? [...chromeFlags, userDataDirFlag]
      : chromeFlags;
  const launcherUserDataDir = bypassUserDataDir ? false : userDataDir;
  logger(
    `[browser] chrome flags (${minimalFlags ? 'minimal' : 'default'}): ` +
      `${effectiveChromeFlags.join(' ')}`,
  );

  const usePatchedLauncher = Boolean(probeHost && probeHost !== '127.0.0.1');
  const maxLaunchAttempts = windowsChromeFromWsl ? 8 : 1;
  const attemptedPorts: number[] = [];
  let launcher: LaunchedChrome | undefined;
  let requestedLaunchPort = debugPort ?? DEFAULT_DEBUG_PORT;
  if (useAutoDebugPort) {
    logger('Using Windows-assigned DevTools port (--remote-debugging-port=0) for WSL launch reliability.');
  }
  let reachable = false;
  const attemptedPortLabels: string[] = [];

  for (let attempt = 0; attempt < maxLaunchAttempts; attempt += 1) {
    attemptedPorts.push(requestedLaunchPort);
    attemptedPortLabels.push(windowsChromeFromWsl && requestedLaunchPort === 0 ? 'auto' : String(requestedLaunchPort));
    try {
      launcher = windowsChromeFromWsl
        ? await launchWindowsChromeFromWsl({
            chromePath: config.chromePath ?? undefined,
            chromeFlags: effectiveChromeFlags,
            userDataDir,
            requestedPort: requestedLaunchPort,
            logger,
            onStage: options.onStage,
          })
        : await launchWithCustomHost({
            profileDirectory: userDataDir,
            chromeFlags: effectiveChromeFlags,
            chromePath: config.chromePath ?? undefined,
            userDataDir: launcherUserDataDir,
            host: usePatchedLauncher ? probeHost ?? '127.0.0.1' : null,
            requestedPort: debugPort ?? undefined,
            ignoreDefaultFlags: minimalFlags,
            launchEnvironment,
            abortSignal: options.abortSignal,
            onStage: options.onStage,
          });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to launch Chrome: ${message}`);
      throw error;
    }
    const pidLabel = typeof launcher.pid === 'number' ? ` (pid ${launcher.pid})` : '';
    const hostLabel = probeHost ? ` on ${probeHost}` : '';
    logger(`Launched Chrome${pidLabel} on port ${launcher.port}${hostLabel}`);

    if (windowsChromeFromWsl) {
      const discoveredPort = await discoverWindowsChromeDevToolsPort({
        userDataDir,
        requestedPort: launcher.port,
        pid: launcher.pid ?? null,
        logger,
      });
      if (discoveredPort && discoveredPort !== launcher.port) {
        logger(
          `Windows Chrome exposed DevTools on ${discoveredPort} instead of requested ${launcher.port}; adopting the live endpoint.`,
        );
        launcher.port = discoveredPort;
      }
    }

    reachable = await waitForDevTools({ host: probeHost ?? '127.0.0.1', port: launcher.port, logger });
    if (reachable) {
      break;
    }

    await safeKillLaunchedChrome(launcher, logger);
    if (windowsChromeFromWsl) {
      await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'force' }).catch(() => undefined);
    }
    if (attempt >= maxLaunchAttempts - 1) {
      break;
    }
    const retryPort = useAutoDebugPort
      ? 0
      : await pickAvailableDebugPort((launcher.port || requestedLaunchPort) + 1, logger, null);
    await options.onWindowsRetry?.({
      failedPort: launcher.port || requestedLaunchPort,
      nextPort: retryPort,
      attempt: attempt + 1,
    });
    logger(
      useAutoDebugPort
        ? 'Windows Chrome did not expose an auto-assigned DevTools port; retrying launch with a fresh auto-assigned port.'
        : `Windows Chrome did not expose DevTools on ${launcher.port}; retrying launch on ${retryPort}.`,
    );
    requestedLaunchPort = retryPort;
  }

  if (!launcher || !reachable) {
    const attemptedPortLabel = attemptedPortLabels.length > 0 ? ` after trying ${attemptedPortLabels.join(', ')}` : '';
    throw new Error(
      `Chrome launched but DevTools port ${probeHost ?? '127.0.0.1'}:${requestedLaunchPort} is unreachable${attemptedPortLabel}. ` +
      `If Chrome is already running with this profile, close it and retry.`,
    );
  }
  const runtimeHost = await ensurePersistentDevToolsEndpoint(launcher.port, probeHost ?? '127.0.0.1', logger);

  let registeredGeneration: BrowserInstanceGeneration | null = null;
  const lifecycleLaunchedAt = new Date().toISOString();
  const recordLifecycle = createOwnedBrowserLifecycleRecorder({
    registryPath: options.registryPath, profilePath: userDataDir,
    pid: launcher.pid, port: launcher.port, launchedAt: lifecycleLaunchedAt, logger,
  });
  launcher.process?.once('exit', (exitCode: number | null, exitSignal: string | null) => {
    recordLifecycle('owned-child-exit', { exitCode, exitSignal });
  });
  if (launcher.pid && registryOptions) {
    const launchedAt = lifecycleLaunchedAt;
    const generation = {
      pid: launcher.pid,
      port: launcher.port,
      launchedAt,
    };
    registeredGeneration = generation;
    const registration = registerInstance(registryOptions, {
      pid: launcher.pid,
      port: launcher.port,
      host: runtimeHost,
      profilePath: userDataDir,
      profileName: resolvedProfileName,
      type: 'chrome',
      launchedAt,
      lastSeenAt: launchedAt,
    });
    launcher.process?.once('exit', () => {
      void registration
        .then(() => unregisterInstanceIfMatches(
          registryOptions,
          userDataDir,
          resolvedProfileName,
          generation,
        ))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          logger(`Failed to retire exited Chrome registry generation: ${message}`);
        });
    });
    await registration;
  }
  recordLifecycle('owned-browser-launched');

  const originalKill = launcher.kill;
  const kill = async () => {
    recordLifecycle('owned-shutdown-requested', { reason: 'managed-handle.kill' });
    if (registryOptions && registeredGeneration) {
      await unregisterInstanceIfMatches(
        registryOptions,
        userDataDir,
        resolvedProfileName,
        registeredGeneration,
      );
    }
    try {
      const result = await originalKill();
      recordLifecycle('owned-shutdown-returned');
      return result;
    } catch (error) {
      recordLifecycle('owned-shutdown-rejected');
      throw error;
    }
  };

  return Object.assign(launcher, { kill, host: runtimeHost, launchedByAuracall: true }) as ManagedChromeHandle;
}

async function safeKillLaunchedChrome(chrome: LaunchedChrome, logger: BrowserLogger): Promise<void> {
  try {
    await chrome.kill();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to terminate unreachable Chrome process: ${message}`);
  }
}

async function waitForDevTools(options: { host: string; port: number; logger: BrowserLogger }): Promise<boolean> {
  const { host, port, logger } = options;
  if (isWindowsLoopbackRemoteHost(host)) {
    const localReady = await waitForWindowsLocalDevTools(port);
    if (!localReady) {
      logger(`Windows Chrome loopback 127.0.0.1:${port} did not expose DevTools after 12 attempts.`);
      return false;
    }
    const relayAttempts = 12;
    const relayDelayMs = 250;
    for (let attempt = 0; attempt < relayAttempts; attempt += 1) {
      if (await isDevToolsResponsive({ host, port })) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, relayDelayMs));
    }
    logger(`DevTools port ${host}:${port} did not respond through the local relay after ${relayAttempts} attempts.`);
    return false;
  }
  const attempts = isWindowsLoopbackRemoteHost(host) ? 60 : 10;
  const delayMs = isWindowsLoopbackRemoteHost(host) ? 500 : 200;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isDevToolsResponsive({ host, port })) {
      return true;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  logger(`DevTools port ${host}:${port} did not respond after ${attempts} attempts.`);
  return false;
}

async function waitForWindowsLocalDevTools(port: number): Promise<boolean> {
  return probeWindowsLocalDevToolsPort(port, { attempts: 12, delayMs: 500 });
}

export async function discoverWindowsChromeDevToolsPort(options: {
  userDataDir: string;
  requestedPort?: number | null;
  pid?: number | null;
  logger?: BrowserLogger;
}): Promise<number | null> {
  if (!isWsl() || !/^\/mnt\/[a-z]\//i.test(userDataDirToComparablePath(options.userDataDir))) {
    return null;
  }
  const logger = options.logger ?? (() => undefined);
  const candidatePorts = new Set<number>();
  const processMatch = await findChromeProcessUsingUserDataDir(options.userDataDir);
  let lastRecordedPort: number | null = null;

  for (let attempt = 0; attempt < WINDOWS_WSL_DISCOVERY_ATTEMPTS; attempt += 1) {
    const recordedPort = await readDevToolsPort(options.userDataDir);
    lastRecordedPort = recordedPort;
    for (const port of orderedCandidatePorts({
      recordedPort,
      requestedPort: options.requestedPort ?? null,
      processPort: processMatch?.port ?? null,
      historicalPorts: candidatePorts,
    })) {
      candidatePorts.add(port);
      if (await probeWindowsLocalDevToolsPort(port)) {
        if (recordedPort !== port) {
          await Promise.resolve(writeDevToolsActivePort(options.userDataDir, port)).catch(() => undefined);
        }
        return port;
      }
    }

    if (attempt < WINDOWS_WSL_DISCOVERY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, WINDOWS_WSL_DISCOVERY_DELAY_MS));
    }
  }

  const discoveredPort = await findResponsiveWindowsDevToolsPortForUserDataDir(options.userDataDir);
  if (discoveredPort) {
    if (lastRecordedPort !== discoveredPort) {
      await Promise.resolve(
        writeDevToolsActivePort(options.userDataDir, discoveredPort),
      ).catch(() => undefined);
    }
    if (processMatch?.port && processMatch.port !== discoveredPort) {
      logger(
        `Windows Chrome profile ${options.userDataDir} is listening on ${discoveredPort} even though the process args advertise ${processMatch.port}.`,
      );
    }
    return discoveredPort;
  }

  if (options.pid) {
    logger(
      `Windows Chrome pid ${options.pid} is running for ${options.userDataDir}, but no responsive DevTools port was discovered.`,
    );
  }
  return null;
}

function userDataDirToComparablePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function orderedCandidatePorts(options: {
  recordedPort: number | null;
  requestedPort: number | null;
  processPort: number | null;
  historicalPorts: ReadonlySet<number>;
}): number[] {
  const ordered: number[] = [];
  const add = (port: number | null) => {
    if (!port || port <= 0 || ordered.includes(port)) {
      return;
    }
    ordered.push(port);
  };

  add(options.recordedPort);
  add(options.requestedPort);
  add(options.processPort);
  for (const port of options.historicalPorts) {
    add(port);
  }
  return ordered;
}

function createAdoptedChromeHandle(options: {
  pid: number;
  port: number;
  host: string;
  logger: BrowserLogger;
  registryOptions: { registryPath: string } | null;
  profilePath: string;
  profileName: string;
  windowsChromeFromWsl: boolean;
  skipShutdown: boolean;
  registeredGeneration?: BrowserInstanceGeneration;
}): LaunchedChrome & { host?: string } {
  const {
    pid,
    port,
    host,
    logger,
    registryOptions,
    profilePath,
    profileName,
    windowsChromeFromWsl,
    skipShutdown,
    registeredGeneration,
  } = options;
  if (skipShutdown) {
    return {
      pid: undefined,
      port,
      kill: async () => { logger('Skipping shutdown of reused Chrome instance.'); },
      process: undefined,
      host,
      launchedByAuracall: false,
    } as unknown as ManagedChromeHandle;
  }

  const recordLifecycle = createOwnedBrowserLifecycleRecorder({
    registryPath: registryOptions?.registryPath, profilePath, pid, port,
    launchedAt: registeredGeneration?.launchedAt ?? null, logger,
  });

  return {
    pid,
    port,
    kill: async () => {
      recordLifecycle('adopted-owned-shutdown-requested', { reason: 'owned-adopted-handle.kill' });
      if (registryOptions && registeredGeneration) {
        await unregisterInstanceIfMatches(
          registryOptions,
          profilePath,
          profileName,
          registeredGeneration,
        );
      }
      await terminateOwnedChromeProcess(pid, logger, { windowsChromeFromWsl });
      recordLifecycle('adopted-owned-shutdown-returned');
    },
    process: undefined,
    host,
    launchedByAuracall: false,
  } as unknown as ManagedChromeHandle;
}

/** Diagnostic observations, not proof that a returned shutdown killed Chrome. */
function createOwnedBrowserLifecycleRecorder(input: {
  registryPath?: string; profilePath: string; pid?: number; port: number;
  launchedAt: string | null; logger: BrowserLogger;
}) {
  let processStartTicks: string | null = null;
  if (process.platform === 'linux' && input.pid) {
    try {
      const stat = readFileSync(`/proc/${input.pid}/stat`, 'utf8');
      processStartTicks = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] ?? null;
    } catch { /* Unavailable process identity must remain unknown. */ }
  }
  const identity = {
    schemaVersion: 1, ownerPid: process.pid, pid: input.pid ?? null,
    processStartTicks, port: input.port, launchedAt: input.launchedAt,
    profileFingerprint: createHash('sha256').update(path.resolve(input.profilePath)).digest('hex'),
  };
  return (event: string, detail: { exitCode?: number | null; exitSignal?: string | null; reason?: string } = {}) => {
    const observation = { ...identity, observedAt: new Date().toISOString(), event, ...detail };
    const line = JSON.stringify(observation);
    input.logger(`[browser-lifecycle] ${line}`);
    if (input.registryPath) {
      try {
        appendFileSync(`${input.registryPath}.lifecycle.jsonl`, `${line}\n`, { mode: 0o600 });
      } catch {
        input.logger('[browser-lifecycle] durable observation write failed');
      }
    }
  };
}

function isCurrentRunOwnedChrome(
  pid: number,
  port: number,
  options: {
    ownedPids?: ReadonlySet<number>;
    ownedPorts?: ReadonlySet<number>;
  },
): boolean {
  return Boolean(options.ownedPids?.has(pid) || options.ownedPorts?.has(port));
}

async function terminateOwnedChromeProcess(
  pid: number,
  logger: BrowserLogger,
  options: { windowsChromeFromWsl: boolean },
): Promise<void> {
  if (options.windowsChromeFromWsl) {
    await terminateWindowsProcess(pid, logger);
    return;
  }
  await terminateChromeProcess(pid, logger);
}

async function terminateChromeProcess(pid: number, logger: BrowserLogger): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise(r => setTimeout(r, 1500));
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // already stopped
    }
  } catch (e) {
    logger(`Failed to kill Chrome process: ${e}`);
  }
}

export function registerTerminationHooks(
  chrome: LaunchedChrome,
  userDataDir: string,
  keepBrowser: boolean,
  logger: BrowserLogger,
  opts?: {
    /** Return true when the run is still in-flight (assistant response pending). */
    isInFlight?: () => boolean;
    /** Persist runtime hints so reattach can find the live Chrome. */
    emitRuntimeHint?: () => Promise<void>;
    /** Preserve the profile directory even when Chrome is terminated. */
    preserveUserDataDir?: boolean;
  },
): () => void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  let handling: boolean | undefined;

  const handleSignal = (signal: NodeJS.Signals) => {
    if (handling) {
      return;
    }
    handling = true;
    const inFlight = opts?.isInFlight?.() ?? false;
    const leaveRunning = keepBrowser || inFlight;
    if (leaveRunning) {
      logger(`Received ${signal}; leaving Chrome running${inFlight ? ' (assistant response pending)' : ''}`);
    } else {
      logger(`Received ${signal}; terminating Chrome process`);
    }
    void (async () => {
      if (leaveRunning) {
        // Ensure reattach hints are written before we exit.
        await opts?.emitRuntimeHint?.().catch(() => undefined);
        if (inFlight) {
          logger('Session still in flight; use your reattach command to continue.');
        }
      } else {
        try {
          await chrome.kill();
        } catch {
          // ignore kill failures
        }
        if (opts?.preserveUserDataDir) {
          // Preserve the profile directory (manual login), but clear reattach hints so we don't
          // try to reuse a dead DevTools port on the next run.
          await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'never' }).catch(() => undefined);
        } else {
          await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    })().finally(() => {
      const exitCode = signal === 'SIGINT' ? 130 : 1;
      // Vitest treats any `process.exit()` call as an unhandled failure, even if mocked.
      // Keep production behavior (hard-exit on signals) while letting tests observe state changes.
      process.exitCode = exitCode;
      const isTestRun = process.env.VITEST === '1' || process.env.NODE_ENV === 'test';
      if (!isTestRun) {
        process.exit(exitCode);
      }
    });
  };

  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of signals) {
    const handler = (): void => handleSignal(signal);
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  return () => {
    for (const signal of signals) {
      const handler = handlers.get(signal);
      if (handler) {
        process.removeListener(signal, handler);
      }
    }
  };
}

export async function hideChromeWindow(chrome: LaunchedChrome, logger: BrowserLogger): Promise<void> {
  const debugHost = (chrome as ManagedChromeHandle).host ?? '127.0.0.1';
  if (chrome.port) {
    try {
      const endpoint = await resolveChromeEndpoint(debugHost, chrome.port, logger);
      try {
        const targets = (await CDP.List({ host: endpoint.host, port: endpoint.port }))
          .filter((target) => target.type === 'page');
        const targetId = targets[0] ? resolveTargetId(targets[0]) : undefined;
        if (targetId) {
          await setChromeTargetWindowState(endpoint.host, endpoint.port, targetId, 'minimized');
          logger('Chrome window minimized');
          return;
        }
      } finally {
        await endpoint.dispose?.().catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to minimize Chrome window via DevTools: ${message}`);
    }
  }
  if (process.platform !== 'darwin') {
    logger('Window minimization is unavailable without a DevTools target');
    return;
  }
  if (!chrome.pid) {
    logger('Unable to hide window: missing Chrome PID');
    return;
  }
  const script = `tell application "System Events"
    try
      set visible of (first process whose unix id is ${chrome.pid}) to false
    end try
  end tell`;
  try {
    await execFileAsync('osascript', ['-e', script]);
    logger('Chrome window hidden (Cmd-H)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to hide Chrome window: ${message}`);
  }
}

export function wasChromeLaunchedByAuracall(chrome: LaunchedChrome | null | undefined): boolean {
  return (chrome as ManagedChromeHandle | null | undefined)?.launchedByAuracall === true;
}

export async function reuseRunningChromeProfile(
  userDataDir: string,
  logger: BrowserLogger,
): Promise<LaunchedChrome | null> {
  const port = await readDevToolsPort(userDataDir);
  if (!port) return null;

  const probe = await isDevToolsResponsive({ port });
  if (!probe) {
    logger(`DevToolsActivePort found for ${userDataDir} but unreachable; launching new Chrome.`);
    // Safe cleanup: remove stale DevToolsActivePort; only remove lock files if recorded pid is dead.
    await cleanupStaleProfileState(userDataDir, logger, { lockRemovalMode: 'if_recorded_pid_dead' });
    return null;
  }

  const pid = await readChromePid(userDataDir);
  logger(
    `Found running Chrome for ${userDataDir}; reusing (DevTools port ${port}${pid ? `, pid ${pid}` : ''})`,
  );
  return {
    port,
    pid: pid ?? undefined,
    kill: async () => {},
    process: undefined,
  } as unknown as LaunchedChrome;
}

export async function resolveUserDataBaseDir(chromePath?: string | null): Promise<string> {
  // On WSL, only Windows-hosted Chrome needs a Windows-backed temp folder.
  if (isWsl() && chromePath && /^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath)) {
    const candidates = [
      '/mnt/c/Users/Public/AppData/Local/Temp',
      '/mnt/c/Temp',
      '/mnt/c/Windows/Temp',
    ];
    for (const candidate of candidates) {
      try {
        await mkdir(candidate, { recursive: true });
        return candidate;
      } catch {
        // try next
      }
    }
  }
  return os.tmpdir();
}

export async function connectToChromeTarget(options: {
  port: number;
  host?: string;
  target?: string;
  logger?: BrowserLogger;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ChromeClient> {
  const logger = options.logger ?? (() => undefined);
  options.abortSignal?.throwIfAborted();
  const endpoint = await resolveChromeEndpoint(options.host, options.port, logger);
  let disposed = false;
  const disposeEndpoint = async () => {
    if (disposed) return;
    disposed = true;
    await endpoint.dispose?.().catch(() => undefined);
  };
  let client: ChromeClient;
  try {
    options.abortSignal?.throwIfAborted();
    client = await runAbortableCdpConnection(
      Promise.resolve().then(() =>
        CDP({
          port: endpoint.port,
          host: endpoint.host,
          target: options.target,
        }),
      ),
      {
        abortSignal: options.abortSignal,
        timeoutMs: normalizePositiveTimeout(
          options.timeoutMs,
          DEFAULT_CDP_CONNECTION_TIMEOUT_MS,
        ),
        onLateResolve: async (lateClient) => {
          await lateClient.close().catch(() => undefined);
          await disposeEndpoint();
        },
      },
    );
  } catch (error) {
    await disposeEndpoint();
    throw error;
  }
  if (endpoint.dispose) {
    const originalClose = client.close.bind(client);
    const cleanup = async () => {
      await disposeEndpoint();
    };
    client.close = async () => {
      try {
        return await originalClose();
      } finally {
        await cleanup();
      }
    };
    client.on('disconnect', () => {
      void cleanup();
    });
  }
  return client;
}

export async function connectToChrome(
  port: number,
  logger: BrowserLogger,
  host?: string,
  options: { abortSignal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ChromeClient> {
  const client = await connectToChromeTarget({ port, host, logger, ...options });
  logger('Connected to Chrome DevTools protocol');
  return client;
}

function normalizePositiveTimeout(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function runAbortableCdpConnection(
  operation: Promise<ChromeClient>,
  options: {
    abortSignal?: AbortSignal;
    timeoutMs: number;
    onLateResolve: (client: ChromeClient) => Promise<void> | void;
  },
): Promise<ChromeClient> {
  options.abortSignal?.throwIfAborted();
  let settled = false;
  let timeout: NodeJS.Timeout | null = null;
  let onAbort: (() => void) | null = null;

  return new Promise<ChromeClient>((resolve, reject) => {
    const finish = (callback: () => void): boolean => {
      if (settled) return false;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (onAbort && options.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
      callback();
      return true;
    };

    operation.then(
      (client) => {
        if (!finish(() => resolve(client))) {
          void Promise.resolve(options.onLateResolve(client)).catch(() => undefined);
        }
      },
      (error) => {
        finish(() => reject(error));
      },
    );

    onAbort = () => {
      finish(() => reject(options.abortSignal?.reason ?? new Error('DevTools attachment aborted.')));
    };
    options.abortSignal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `DevTools attachment stage browserDevToolsCdpConnection timed out after ${options.timeoutMs}ms.`,
          ),
        ),
      );
    }, options.timeoutMs);
  });
}

export async function listChromeTargets(
  port: number,
  host?: string,
  logger: BrowserLogger = () => undefined,
) {
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  try {
    return await withTimeout(
      CDP.List({ host: endpoint.host, port: endpoint.port }),
      DEFAULT_CDP_LIST_TIMEOUT_MS,
      `Timed out listing Chrome DevTools targets at ${endpoint.host}:${endpoint.port}`,
    );
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      timeout = null;
      reject(new Error(message));
    }, timeoutMs);
    operation.then(
      (value) => {
        if (timeout) clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export interface PreLeaseTargetAcquisitionAuthority {
  kind: 'pre-lease-target-acquisition';
  operationId: string;
  reason: string;
}

export async function openChromeTarget(
  port: number,
  url: string,
  host?: string,
  logger: BrowserLogger = () => undefined,
  authority?: PreLeaseTargetAcquisitionAuthority,
) {
  if (
    authority?.kind !== 'pre-lease-target-acquisition' ||
    !authority.operationId.trim() ||
    !authority.reason.trim()
  ) {
    throw new Error('Chrome target creation requires explicit pre-lease acquisition authority.');
  }
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  try {
    return await CDP.New({ host: endpoint.host, port: endpoint.port, url });
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

export type ChromeTabReusePolicy = 'new' | 'exact' | 'same-origin';

export type OpenOrReuseChromeTargetResult = {
  target: Awaited<ReturnType<typeof CDP.New>>;
  reused: boolean;
  reason: 'exact' | 'blank' | 'same-origin' | 'compatible-host' | 'new';
};

async function beginTargetTrafficAction(input: {
  governor?: ProviderTrafficGovernor;
  authorityFactory?: ProviderTrafficAuthorityFactory;
  mutationAudit?: BrowserMutationAuditSink;
  source: string;
  requestedUrl: string;
  fromUrl?: string | null;
  toUrl: string;
  targetId?: string | null;
  reused: boolean;
  reason: string;
  providerTrafficRequired?: boolean;
}): Promise<ProviderTrafficAction> {
  const authority =
    !input.governor && input.authorityFactory && input.targetId
      ? await input.authorityFactory.acquire({ targetId: input.targetId })
      : undefined;
  const governor = input.governor ?? authority?.governor;
  if (governor) {
    const action = await governor.begin({
      kind: 'target-open-or-reuse',
      interactionClass: 'renavigation',
      source: input.source,
      requestedUrl: input.requestedUrl,
      fromUrl: input.fromUrl,
      toUrl: input.toUrl,
      targetId: input.targetId,
      reused: input.reused,
      reason: input.reason,
    });
    return {
      id: action.id,
      async settle(details) {
        try {
          await action.settle(details);
        } finally {
          await authority?.close({
            outcome: details.outcome === 'succeeded' ? 'succeeded' : 'failed',
            effectState: 'settled',
            reason: details.error ?? details.reason ?? null,
          });
        }
      },
    };
  }
  if (input.providerTrafficRequired) {
    throw new Error(`Provider traffic governor is required before physical action: ${input.source}.`);
  }
  const legacy = beginBrowserMutation(input.mutationAudit, {
    kind: 'target-open-or-reuse',
    source: input.source,
    requestedUrl: input.requestedUrl,
    fromUrl: input.fromUrl,
    toUrl: input.toUrl,
    targetId: input.targetId,
    reused: input.reused,
    reason: input.reason,
  });
  return { id: legacy.id, settle: legacy.complete };
}

export async function openOrReuseChromeTarget(
  port: number,
  url: string,
  options: {
    host?: string;
    logger?: BrowserLogger;
    reusePolicy?: ChromeTabReusePolicy;
    compatibleHosts?: string[];
    matchingTabLimit?: number;
    blankTabLimit?: number;
    collapseDisposableWindows?: boolean;
	    cleanupExistingTargets?: boolean;
	    suppressFocus?: boolean;
	    navigateReusedTargets?: boolean;
	    mutationAudit?: BrowserMutationAuditSink;
	    providerTrafficGovernor?: ProviderTrafficGovernor;
	    providerTrafficAuthorityFactory?: ProviderTrafficAuthorityFactory;
	    providerTrafficRequired?: boolean;
	    mutationSource?: string;
	  } = {},
	): Promise<OpenOrReuseChromeTargetResult> {
  const logger = options.logger ?? (() => undefined);
  const mutationSource = options.mutationSource ?? 'browser-service:openOrReuseChromeTarget';
  const reusePolicy = options.reusePolicy ?? 'same-origin';
  const compatibleHosts = normalizeCompatibleHosts(options.compatibleHosts);
  const matchingTabLimit = Math.max(1, options.matchingTabLimit ?? 3);
	  const blankTabLimit = Math.max(0, options.blankTabLimit ?? 1);
	  const collapseDisposableWindows = options.collapseDisposableWindows ?? true;
	  const cleanupExistingTargets = options.cleanupExistingTargets !== false;
	  const navigateReusedTargets = options.navigateReusedTargets !== false;
	  const endpoint = await resolveChromeEndpoint(options.host, port, logger);
  try {
    const pageTargets = (await CDP.List({ host: endpoint.host, port: endpoint.port }))
      .filter((target) => target.type === 'page');
    if (reusePolicy !== 'new') {
      const normalizedUrl = normalizeChromeTargetUrl(url);
      const exactTarget = findLastMatchingTarget(
        pageTargets,
        (target) => normalizeChromeTargetUrl(target.url ?? '') === normalizedUrl,
      );
      if (exactTarget) {
        const targetId = resolveTargetId(exactTarget);
	        const audit = await beginTargetTrafficAction({
	          governor: options.providerTrafficGovernor,
	          authorityFactory: options.providerTrafficAuthorityFactory,
	          mutationAudit: options.mutationAudit,
	          providerTrafficRequired: options.providerTrafficRequired,
	          source: mutationSource,
          requestedUrl: url,
          fromUrl: exactTarget.url ?? null,
          toUrl: exactTarget.url ?? url,
          targetId,
          reused: true,
          reason: 'exact',
        });
        await focusChromeTarget(endpoint.host, endpoint.port, targetId, url, false, options.suppressFocus);
	        await audit.settle({
          outcome: 'succeeded',
          targetId,
          toUrl: exactTarget.url ?? url,
          reused: true,
          reason: 'exact',
        });
        const result = { target: exactTarget, reused: true, reason: 'exact' as const };
        await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
          selectedTargetId: targetId,
          requestedUrl: url,
          compatibleHosts,
          matchingTabLimit,
          blankTabLimit,
          collapseDisposableWindows,
          logger,
        });
        return result;
      }

      const blankTarget = findLastMatchingTarget(pageTargets, (target) => isReusableBlankTarget(target.url ?? ''));
      if (blankTarget) {
        const targetId = resolveTargetId(blankTarget);
	        const audit = await beginTargetTrafficAction({
	          governor: options.providerTrafficGovernor,
	          authorityFactory: options.providerTrafficAuthorityFactory,
	          mutationAudit: options.mutationAudit,
	          providerTrafficRequired: options.providerTrafficRequired,
          source: mutationSource,
          requestedUrl: url,
          fromUrl: blankTarget.url ?? null,
          toUrl: url,
          targetId,
          reused: true,
          reason: 'blank',
        });
        await focusChromeTarget(endpoint.host, endpoint.port, targetId, url, true, options.suppressFocus);
	        await audit.settle({
          outcome: 'succeeded',
          targetId,
          toUrl: url,
          reused: true,
          reason: 'blank',
        });
        const result = { target: blankTarget, reused: true, reason: 'blank' as const };
        await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
          selectedTargetId: targetId,
          requestedUrl: url,
          compatibleHosts,
          matchingTabLimit,
          blankTabLimit,
          collapseDisposableWindows,
          logger,
        });
        return result;
      }

      if (reusePolicy === 'same-origin') {
        const sameOriginTarget = findLastMatchingTarget(
          pageTargets,
          (target) => urlsShareOrigin(target.url ?? '', url),
        );
	        if (sameOriginTarget) {
	          const targetId = resolveTargetId(sameOriginTarget);
	          const targetUrl = navigateReusedTargets ? url : sameOriginTarget.url ?? url;
	          const audit = await beginTargetTrafficAction({
	            governor: options.providerTrafficGovernor,
	            authorityFactory: options.providerTrafficAuthorityFactory,
	            mutationAudit: options.mutationAudit,
	            providerTrafficRequired: options.providerTrafficRequired,
	            source: mutationSource,
	            requestedUrl: url,
	            fromUrl: sameOriginTarget.url ?? null,
	            toUrl: targetUrl,
	            targetId,
	            reused: true,
	            reason: 'same-origin',
	          });
          await focusChromeTarget(
            endpoint.host,
	            endpoint.port,
	            targetId,
	            url,
	            navigateReusedTargets,
	            options.suppressFocus,
	          );
	          await audit.settle({
	            outcome: 'succeeded',
	            targetId,
	            toUrl: targetUrl,
	            reused: true,
	            reason: 'same-origin',
	          });
          const result = { target: sameOriginTarget, reused: true, reason: 'same-origin' as const };
          await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
            selectedTargetId: targetId,
            requestedUrl: url,
            compatibleHosts,
            matchingTabLimit,
            blankTabLimit,
            collapseDisposableWindows,
            logger,
          });
          return result;
        }
        if (compatibleHosts.length > 0) {
          const compatibleHostTarget = findLastMatchingTarget(
            pageTargets,
            (target) => urlsShareCompatibleHost(target.url ?? '', url, compatibleHosts),
          );
	          if (compatibleHostTarget) {
	            const targetId = resolveTargetId(compatibleHostTarget);
	            const targetUrl = navigateReusedTargets ? url : compatibleHostTarget.url ?? url;
	            const audit = await beginTargetTrafficAction({
	              governor: options.providerTrafficGovernor,
	              authorityFactory: options.providerTrafficAuthorityFactory,
	              mutationAudit: options.mutationAudit,
	              providerTrafficRequired: options.providerTrafficRequired,
	              source: mutationSource,
	              requestedUrl: url,
	              fromUrl: compatibleHostTarget.url ?? null,
	              toUrl: targetUrl,
	              targetId,
	              reused: true,
	              reason: 'compatible-host',
	            });
            await focusChromeTarget(
              endpoint.host,
	              endpoint.port,
	              targetId,
	              url,
	              navigateReusedTargets,
	              options.suppressFocus,
	            );
	            await audit.settle({
	              outcome: 'succeeded',
	              targetId,
	              toUrl: targetUrl,
	              reused: true,
	              reason: 'compatible-host',
	            });
            const result = { target: compatibleHostTarget, reused: true, reason: 'compatible-host' as const };
            await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
              selectedTargetId: targetId,
              requestedUrl: url,
              compatibleHosts,
              matchingTabLimit,
              blankTabLimit,
              collapseDisposableWindows,
              logger,
            });
            return result;
          }
        }
      }
    }

	    const audit = await beginTargetTrafficAction({
	      governor: options.providerTrafficGovernor,
	      authorityFactory: options.providerTrafficAuthorityFactory,
	      mutationAudit: options.mutationAudit,
	      providerTrafficRequired: options.providerTrafficRequired,
      source: mutationSource,
      requestedUrl: url,
      toUrl: url,
      reused: false,
      reason: 'new',
    });
    const created = await CDP.New({ host: endpoint.host, port: endpoint.port, url });
	    await audit.settle({
      outcome: 'succeeded',
      targetId: resolveTargetId(created),
      toUrl: created.url ?? url,
      reused: false,
      reason: 'new',
    });
    const result = { target: created, reused: false, reason: 'new' as const };
    if (cleanupExistingTargets) {
      await cleanupChromeTargetStockpile(endpoint.host, endpoint.port, {
        selectedTargetId: resolveTargetId(created),
        requestedUrl: url,
        compatibleHosts,
        matchingTabLimit,
        blankTabLimit,
        collapseDisposableWindows,
        logger,
      });
    }
    return result;
  } finally {
    await endpoint.dispose?.().catch(() => undefined);
  }
}

// NOTE: resolveWslHost/buildWslFirewallHint are defined below near isWsl to reuse helpers.

export async function connectToRemoteChrome(
  host: string,
  port: number,
  logger: BrowserLogger,
  targetUrl?: string,
  options: {
    exactTargetId?: string;
    compatibleHosts?: string[];
    reusePolicy?: ChromeTabReusePolicy;
    serviceTabLimit?: number;
    blankTabLimit?: number;
    collapseDisposableWindows?: boolean;
    suppressFocus?: boolean;
    navigateReusedTargets?: boolean;
    mutationAudit?: BrowserMutationAuditSink;
    providerTrafficGovernor?: ProviderTrafficGovernor;
    providerTrafficAuthorityFactory?: ProviderTrafficAuthorityFactory;
    providerTrafficRequired?: boolean;
    mutationSource?: string;
  } = {},
): Promise<RemoteChromeConnection> {
  const endpoint = await resolveChromeEndpoint(host, port, logger);
  const connectHost = endpoint.host;
  const connectPort = endpoint.port;
  const disposeRelay = endpoint.dispose;
  if (isWindowsLoopbackRemoteHost(host)) {
    logger(`Routing Windows Chrome loopback ${port} through local relay ${connectHost}:${connectPort}`);
  }

  const exactTargetId = options.exactTargetId?.trim();
  if (exactTargetId) {
    try {
      const client = await CDP({ host: connectHost, port: connectPort, target: exactTargetId });
      logger(`Connected to exact remote Chrome target ${exactTargetId}`);
      return {
        client,
        targetId: exactTargetId,
        host: connectHost,
        port: connectPort,
        dispose: disposeRelay,
      };
    } catch (error) {
      await disposeRelay?.().catch(() => undefined);
      throw error;
    }
  }

  if (targetUrl) {
    try {
      const opened = await openOrReuseChromeTarget(connectPort, targetUrl, {
        host: connectHost,
        logger,
        reusePolicy: options.reusePolicy ?? 'same-origin',
        compatibleHosts: options.compatibleHosts,
        matchingTabLimit: options.serviceTabLimit,
        blankTabLimit: options.blankTabLimit,
        collapseDisposableWindows: options.collapseDisposableWindows,
        suppressFocus: options.suppressFocus,
        navigateReusedTargets: options.navigateReusedTargets,
        mutationAudit: options.mutationAudit,
        providerTrafficGovernor: options.providerTrafficGovernor,
        providerTrafficAuthorityFactory: options.providerTrafficAuthorityFactory,
        providerTrafficRequired: options.providerTrafficRequired,
        mutationSource: options.mutationSource ?? 'browser-service:connectToRemoteChrome',
      });
      const targetId = resolveTargetId(opened.target);
      const client = await CDP({ host: connectHost, port: connectPort, target: targetId });
      logger(
        opened.reused
          ? `Reused ${opened.reason} remote Chrome tab targeting ${targetUrl}`
          : `Opened new remote Chrome tab targeting ${targetUrl}`,
      );
      return { client, targetId, host: connectHost, port: connectPort, dispose: disposeRelay };
    } catch (error) {
      if (options.providerTrafficRequired) {
        await disposeRelay?.().catch(() => undefined);
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger(`Failed to open dedicated remote Chrome tab (${message}); falling back to first target.`);
    }
  }
  try {
    const fallbackClient = await CDP({ host: connectHost, port: connectPort });
    logger(`Connected to remote Chrome DevTools protocol at ${connectHost}:${connectPort}`);
    return { client: fallbackClient, host: connectHost, port: connectPort, dispose: disposeRelay };
  } catch (error) {
    await disposeRelay?.().catch(() => undefined);
    throw error;
  }
}

export async function closeRemoteChromeTarget(
  host: string,
  port: number,
  targetId: string | undefined,
  logger: BrowserLogger,
): Promise<void> {
  if (!targetId) {
    return;
  }
  try {
    const endpoint = await resolveChromeEndpoint(host, port, logger);
    try {
      await CDP.Close({ host: endpoint.host, port: endpoint.port, id: targetId });
    } finally {
      await endpoint.dispose?.().catch(() => undefined);
    }
    if (logger.verbose) {
      logger(`Closed remote Chrome tab ${targetId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to close remote Chrome tab ${targetId}: ${message}`);
  }
}

export interface RemoteChromeConnection {
  client: ChromeClient;
  targetId?: string;
  host: string;
  port: number;
  dispose?: () => Promise<void>;
}

async function focusChromeTarget(
  host: string,
  port: number,
  targetId: string,
  navigateUrl?: string,
  navigate = false,
  suppressFocus = false,
): Promise<void> {
  const client = await CDP({ host, port, target: targetId });
  try {
    await client.Page.enable().catch(() => undefined);
    if (navigate && navigateUrl) {
      await client.Page.navigate({ url: navigateUrl });
    }
    if (!suppressFocus) {
      await client.Page.bringToFront().catch(() => undefined);
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function setChromeTargetWindowState(
  host: string,
  port: number,
  targetId: string,
  state: 'minimized' | 'normal',
): Promise<void> {
  const client = await CDP({ host, port, target: targetId });
  try {
    const window = await client.Browser.getWindowForTarget({ targetId });
    await client.Browser.setWindowBounds({
      windowId: window.windowId,
      bounds: { windowState: state },
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

function resolveTargetId(target: { id?: string | null; targetId?: string | null }): string {
  const resolved = target.targetId ?? target.id;
  if (!resolved) {
    throw new Error('Chrome target id missing.');
  }
  return resolved;
}

function normalizeChromeTargetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function urlsShareOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function isReusableBlankTarget(value: string): boolean {
  const normalized = normalizeChromeTargetUrl(value);
  return normalized === 'about:blank'
    || normalized === 'chrome://newtab/'
    || normalized === 'chrome://new-tab-page/'
    || normalized === 'edge://newtab/';
}

async function cleanupChromeTargetStockpile(
  host: string,
  port: number,
  options: {
    selectedTargetId: string;
    requestedUrl: string;
    compatibleHosts: string[];
    matchingTabLimit: number;
    blankTabLimit: number;
    collapseDisposableWindows: boolean;
    logger: BrowserLogger;
  },
): Promise<void> {
  const {
    selectedTargetId,
    requestedUrl,
    compatibleHosts,
    matchingTabLimit,
    blankTabLimit,
    collapseDisposableWindows,
    logger,
  } = options;
  const pageTargets = (await CDP.List({ host, port })).filter((target) => target.type === 'page');
  const windowAssignments = collapseDisposableWindows
    ? await loadChromeWindowAssignments(
        host,
        port,
        pageTargets.map((target) => resolveTargetId(target)),
      )
    : new Map<string, number>();
  const windowTargetsToClose = collapseDisposableWindows
    ? pickDisposableWindowTargetsToClose(
        pageTargets,
        windowAssignments,
        selectedTargetId,
        requestedUrl,
        compatibleHosts,
      )
    : [];
  const windowClosedTargetIds = new Set(windowTargetsToClose.map((target) => resolveTargetId(target)));
  const remainingTargets = pageTargets.filter((target) => !windowClosedTargetIds.has(resolveTargetId(target)));
  const matchingTargets = remainingTargets.filter((target) =>
    isMatchingChromeTargetFamily(target.url ?? '', requestedUrl, compatibleHosts),
  );
  const blankTargets = remainingTargets.filter((target) => isReusableBlankTarget(target.url ?? ''));
  const targetsToClose = [
    ...windowTargetsToClose,
    ...pickTargetsToClose(matchingTargets, matchingTabLimit, selectedTargetId),
    ...pickTargetsToClose(blankTargets, blankTabLimit, selectedTargetId),
  ];
  const uniqueTargetIds = Array.from(new Set(targetsToClose.map((target) => resolveTargetId(target))));
  if (uniqueTargetIds.length === 0) {
    return;
  }
  for (const targetId of uniqueTargetIds) {
    try {
      await CDP.Close({ host, port, id: targetId });
    } catch {
      // Best effort cleanup.
    }
  }
  logger(
    `[browser-tabs] Trimmed ${uniqueTargetIds.length} stale tab(s) after selecting ${selectedTargetId}.`,
  );
}

async function loadChromeWindowAssignments(
  host: string,
  port: number,
  targetIds: string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) {
    return new Map();
  }
  const client = await CDP({ host, port });
  try {
    if (typeof client.Browser?.getWindowForTarget !== 'function') {
      return new Map();
    }
    const assignments = await Promise.all(
      targetIds.map(async (targetId) => {
        try {
          const result = await client.Browser.getWindowForTarget({ targetId });
          return [targetId, result.windowId] as const;
        } catch {
          return null;
        }
      }),
    );
    return new Map(assignments.filter((entry): entry is readonly [string, number] => Boolean(entry)));
  } finally {
    await client.close().catch(() => undefined);
  }
}

function pickTargetsToClose(
  targets: Array<{ id?: string | null; targetId?: string | null }>,
  limit: number,
  selectedTargetId: string,
): Array<{ id?: string | null; targetId?: string | null }> {
  const keep = new Set<string>([selectedTargetId]);
  const closable = targets.filter((target) => resolveTargetId(target) !== selectedTargetId);
  const allowedExtra = Math.max(0, limit - (targets.some((target) => resolveTargetId(target) === selectedTargetId) ? 1 : 0));
  const keepFromTail = closable.slice(Math.max(0, closable.length - allowedExtra));
  for (const target of keepFromTail) {
    keep.add(resolveTargetId(target));
  }
  return closable.filter((target) => !keep.has(resolveTargetId(target)));
}

function pickDisposableWindowTargetsToClose(
  targets: Array<{ id?: string | null; targetId?: string | null; url?: string | null }>,
  windowAssignments: Map<string, number>,
  selectedTargetId: string,
  requestedUrl: string,
  compatibleHosts: string[],
): Array<{ id?: string | null; targetId?: string | null; url?: string | null }> {
  const selectedWindowId = windowAssignments.get(selectedTargetId);
  if (selectedWindowId === undefined) {
    return [];
  }
  const windows = new Map<number, Array<{ id?: string | null; targetId?: string | null; url?: string | null }>>();
  for (const target of targets) {
    const targetId = resolveTargetId(target);
    const windowId = windowAssignments.get(targetId);
    if (windowId === undefined) {
      continue;
    }
    const bucket = windows.get(windowId) ?? [];
    bucket.push(target);
    windows.set(windowId, bucket);
  }
  const targetsToClose: Array<{ id?: string | null; targetId?: string | null; url?: string | null }> = [];
  for (const [windowId, windowTargets] of windows.entries()) {
    if (windowId === selectedWindowId) {
      continue;
    }
    const disposableWindow = windowTargets.every((target) =>
      isDisposableWindowTarget(target.url ?? '', requestedUrl, compatibleHosts),
    );
    if (!disposableWindow) {
      continue;
    }
    targetsToClose.push(...windowTargets);
  }
  return targetsToClose;
}

function isMatchingChromeTargetFamily(
  candidateUrl: string,
  requestedUrl: string,
  compatibleHosts: string[],
): boolean {
  const normalizedCandidate = normalizeChromeTargetUrl(candidateUrl);
  const normalizedRequested = normalizeChromeTargetUrl(requestedUrl);
  if (!normalizedCandidate || !normalizedRequested) {
    return false;
  }
  return normalizedCandidate === normalizedRequested
    || urlsShareOrigin(normalizedCandidate, normalizedRequested)
    || urlsShareCompatibleHost(normalizedCandidate, normalizedRequested, compatibleHosts);
}

function isDisposableWindowTarget(
  candidateUrl: string,
  requestedUrl: string,
  compatibleHosts: string[],
): boolean {
  return isReusableBlankTarget(candidateUrl)
    || isMatchingChromeTargetFamily(candidateUrl, requestedUrl, compatibleHosts);
}

function urlsShareCompatibleHost(left: string, right: string, compatibleHosts: string[]): boolean {
  try {
    const leftHost = new URL(left).host.toLowerCase();
    const rightHost = new URL(right).host.toLowerCase();
    return compatibleHosts.includes(leftHost) && compatibleHosts.includes(rightHost);
  } catch {
    return false;
  }
}

function normalizeCompatibleHosts(hosts: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (hosts ?? [])
        .map((host) => host.trim().toLowerCase())
        .filter((host) => host.length > 0),
    ),
  );
}

function findLastMatchingTarget<T>(
  targets: T[],
  predicate: (target: T) => boolean,
): T | undefined {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const candidate = targets[index];
    if (predicate(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function buildChromeFlags(
  headless: boolean,
  debugBindAddress?: string | null,
  chromeProfile?: string,
  options: { minimal?: boolean; startMinimized?: boolean; suppressStartupWindow?: boolean } = {},
): string[] {
  const flags = options.minimal
    ? [options.suppressStartupWindow ? '--no-startup-window' : '--new-window', '--no-first-run', '--hide-crash-restore-bubble']
    : [
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-features=TranslateUI,AutomationControlled',
        '--mute-audio',
        '--window-size=1280,720',
        '--lang=en-US',
        '--accept-lang=en-US,en',
        '--hide-crash-restore-bubble',
      ];
  if (options.suppressStartupWindow && !options.minimal) {
    flags.push('--no-startup-window');
  }
  if (chromeProfile) {
    flags.push(`--profile-directory=${chromeProfile}`);
  }

  if (process.platform !== 'win32') {
    flags.push('--password-store=basic');
    flags.push('--use-mock-keychain');
  }

  if (debugBindAddress) {
    flags.push(`--remote-debugging-address=${debugBindAddress}`);
  }

  if (headless) {
    flags.push('--headless=new');
  }

  if (!headless && options.startMinimized) {
    flags.push('--start-minimized');
  }

  if (!headless && !options.startMinimized) {
    flags.push('--window-position=0,0');
    if (options.minimal) {
      flags.push('--window-size=1400,1000');
    }
  }

  return flags;
}

function parseDebugPortEnv(): number | null {
  const raw =
    process.env.BROWSER_SERVICE_BROWSER_PORT ??
    process.env.BROWSER_SERVICE_BROWSER_DEBUG_PORT ??
    process.env.AURACALL_BROWSER_PORT ??
    process.env.AURACALL_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    return null;
  }
  return value;
}

function resolveRemoteDebugHost(chromePath?: string): string | null {
  if (!isWsl()) {
    return null;
  }
  if (chromePath && !/^([a-zA-Z]:[\\/]|\/mnt\/)/.test(chromePath)) {
    return null;
  }
  return WINDOWS_LOOPBACK_REMOTE_HOST;
}

function isWsl(): boolean {
  return isWslEnvironment();
}

export function resolveWslHost(): string | null {
  const override =
    process.env.BROWSER_SERVICE_BROWSER_REMOTE_DEBUG_HOST?.trim() ||
    process.env.AURACALL_BROWSER_REMOTE_DEBUG_HOST?.trim() ||
    process.env.WSL_HOST_IP?.trim();
  if (override) {
    return override;
  }
  if (!isWsl()) {
    return null;
  }
  try {
    return parseWslResolverHost(readFileSync('/etc/resolv.conf', 'utf8'));
  } catch {
    // ignore; fall back to localhost
  }
  return null;
}

export function parseWslResolverHost(resolvConf: string): string | null {
  for (const line of resolvConf.split('\n')) {
    const match = line.match(/^nameserver\s+([0-9.]+)/);
    if (match?.[1]) {
      return match[1].startsWith('127.') ? '127.0.0.1' : match[1];
    }
  }
  return null;
}

export function buildWslFirewallHint(host: string, devtoolsPort: number): string | null {
  if (!isWsl()) {
    return null;
  }
  if (isWindowsLoopbackRemoteHost(host)) {
    return [
      `Windows Chrome DevTools ${devtoolsPort} did not become reachable through the local loopback relay.`,
      'Verify that chrome.exe launched with --remote-debugging-port and that Windows PowerShell is available from WSL.',
    ].join(' ');
  }
  return [
    `DevTools port ${host}:${devtoolsPort} is blocked from WSL.`,
    'PowerShell (admin):',
    `New-NetFirewallRule -DisplayName 'Chrome DevTools ${devtoolsPort}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${devtoolsPort}`,
    "New-NetFirewallRule -DisplayName 'Chrome DevTools (chrome.exe)' -Direction Inbound -Action Allow -Program 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -Protocol TCP",
  ].join(' ');
}

async function ensurePersistentDevToolsEndpoint(
  port: number,
  host: string,
  logger: BrowserLogger,
): Promise<string> {
  if (!isWindowsLoopbackRemoteHost(host)) {
    return host || '127.0.0.1';
  }
  await ensureDetachedWindowsLoopbackRelay(port, logger, { listenPort: port });
  return WINDOWS_LOOPBACK_REMOTE_HOST;
}

function isWindowsHostedChromePath(chromePath?: string | null): boolean {
  return isWsl() && isWindowsPath(chromePath ?? null);
}

async function launchWindowsChromeFromWsl(options: {
  chromePath?: string | null;
  chromeFlags: string[];
  userDataDir: string;
  requestedPort: number;
  logger: BrowserLogger;
  onStage?: (stage: string) => void;
}): Promise<LaunchedChrome & { host?: string }> {
  const chromePath = options.chromePath ?? undefined;
  if (!chromePath) {
    throw new Error('Missing Windows Chrome path for WSL launch.');
  }
  const powershellPath = resolveWindowsPowerShellPath();
  const finalFlags = options.chromeFlags.includes('--remote-allow-origins=*')
    ? options.chromeFlags
    : ['--remote-allow-origins=*', ...options.chromeFlags];
  const remoteDebugPortFlag = options.requestedPort > 0
    ? `--remote-debugging-port=${options.requestedPort}`
    : '--remote-debugging-port=0';
  const argumentList = [
    ...finalFlags,
    remoteDebugPortFlag,
    'about:blank',
  ].map((entry) => quotePowerShellLiteral(toWindowsPath(entry)));
  const command =
    `$process = Start-Process -FilePath ${quotePowerShellLiteral(toWindowsPath(chromePath))} ` +
    `-ArgumentList @(${argumentList.join(', ')}) -PassThru -WindowStyle Normal; ` +
    'Write-Output $process.Id';

  options.onStage?.('browserChromeProcessSpawn');
  const { stdout } = await execFileAsync(
    powershellPath,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { timeout: 30_000, maxBuffer: 1024 * 1024 },
  );
  const pid = Number.parseInt(String(stdout ?? '').trim().split(/\r?\n/u).at(-1) ?? '', 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Failed to launch Windows Chrome via PowerShell: ${String(stdout ?? '').trim() || 'missing pid'}`);
  }
  options.logger(
    options.requestedPort > 0
      ? `Started Windows Chrome via PowerShell (pid ${pid}) on port ${options.requestedPort}`
      : `Started Windows Chrome via PowerShell (pid ${pid}) with an auto-assigned DevTools port`,
  );
  return {
    pid,
    port: options.requestedPort,
    process: undefined,
    kill: async () => {
      await terminateWindowsProcess(pid, options.logger);
    },
    host: WINDOWS_LOOPBACK_REMOTE_HOST,
  } as unknown as LaunchedChrome & { host?: string };
}

async function terminateWindowsProcess(pid: number, logger: BrowserLogger): Promise<void> {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }
  try {
    await execFileAsync('/mnt/c/Windows/System32/taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger(`Failed to taskkill Windows Chrome pid ${pid}: ${message}`);
  }
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}


async function launchWithCustomHost({
  chromeFlags,
  chromePath,
  userDataDir,
  profileDirectory,
  host,
  requestedPort,
  ignoreDefaultFlags,
  launchEnvironment,
  abortSignal,
  onStage,
}: {
  chromeFlags: string[];
  chromePath?: string | null;
  userDataDir: string | boolean;
  profileDirectory?: string;
  host: string | null;
  requestedPort?: number;
  ignoreDefaultFlags?: boolean;
  launchEnvironment?: NodeJS.ProcessEnv;
  abortSignal?: AbortSignal;
  onStage?: (stage: string) => void;
}): Promise<LaunchedChrome & { host?: string }> {
  const launcher = new Launcher({
    chromePath: chromePath ?? undefined,
    chromeFlags,
    userDataDir,
    handleSIGINT: false,
    port: requestedPort ?? undefined,
    ignoreDefaultFlags: Boolean(ignoreDefaultFlags),
    envVars: launchEnvironment,
  });

  const launcherTempPrefix =
    userDataDir === false ? resolveChromeLauncherTempPrefix(chromePath) : null;
  if (launcherTempPrefix) {
    const patched = launcher as unknown as { makeTmpDir: () => string };
    patched.makeTmpDir = () => mkdtempSync(launcherTempPrefix);
  }

  const patched = launcher as unknown as {
    isDebuggerReady?: () => Promise<void>;
    port?: number;
    spawn: (...args: unknown[]) => unknown;
  };
  const originalSpawn = patched.spawn.bind(launcher);
  patched.spawn = (...args: unknown[]) => {
    onStage?.('browserChromeProcessSpawn');
    const process = originalSpawn(...args);
    onStage?.('browserChromeDebuggerReadiness');
    return process;
  };
  const debugHost = host ?? '127.0.0.1';
  patched.isDebuggerReady = function patchedIsDebuggerReady(this: Launcher & { port?: number }): Promise<void> {
    const debugPort = this.port ?? 0;
    if (!debugPort) {
      return Promise.reject(new Error('Missing Chrome debug port'));
    }
    onStage?.('browserChromePortProbe');
    return probeChromeDebuggerPort({
      host: debugHost,
      port: debugPort,
      abortSignal,
      readOwnedProcessState: () => ({
        processId: launcher.pid,
        exitCode: launcher.chromeProcess?.exitCode,
        exitSignal: launcher.chromeProcess?.signalCode,
        profileDirectory,
      }),
    });
  };

  await runAbortableBrowserLaunch({
    launch: () => launcher.launch(),
    cleanup: () => launcher.kill(),
    abortSignal,
  });

  const kill = async () => launcher.kill();
  return {
    pid: launcher.pid ?? undefined,
    port: launcher.port ?? 0,
    process: launcher.chromeProcess as unknown as NonNullable<LaunchedChrome['process']>,
    kill,
    host: host ?? undefined,
    remoteDebuggingPipes: launcher.remoteDebuggingPipes,
  } as unknown as LaunchedChrome & { host?: string };
}

function shouldBypassLauncherUserDataDir(_chromePath?: string): boolean {
  return isWsl();
}

export function resolveChromeLauncherTempPrefix(chromePath?: string | null): string | null {
  if (!isWsl() || isWindowsPath(chromePath ?? null)) {
    return null;
  }
  return path.join(os.tmpdir(), 'auracall-chrome-launcher-');
}

export function resolveUserDataDirFlag(userDataDir: string, chromePath?: string): string {
  if (!isWsl()) {
    return userDataDir;
  }
  const windowsChrome = isWindowsPath(chromePath ?? null);
  if (!windowsChrome) {
    return userDataDir;
  }
  return `"${toWindowsPath(userDataDir)}"`;
}
