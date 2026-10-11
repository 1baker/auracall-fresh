import fs from 'node:fs/promises';
import { applyDesktopProfileAssignments } from './browser/service/desktopProfileAssignments.js';
import path from 'node:path';
import JSON5 from 'json5';
import { getAuracallHomeDir } from './auracallHome.js';
import type { OracleConfig } from './schema/types.js';
import type { ResolvedUserConfig } from './config/schema.js';
import { setBrowserProfile, setRuntimeProfile, setRuntimeProfileBrowserProfile } from './config/model.js';
import { CHATGPT_URL, GEMINI_URL, GROK_URL } from './browser/constants.js';
import { discoverDefaultBrowserProfile } from './browser/service/profile.js';
import { DEFAULT_MODEL } from './oracle.js';
import { materializeConfigV2 } from './config/migrate.js';

export type UserConfig = OracleConfig;
export type { ResolvedUserConfig };

function resolveUserConfigPath(): string {
  return process.env.AURACALL_CONFIG_PATH ?? path.join(getAuracallHomeDir(), 'config.json');
}

function resolveSystemConfigPath(): string | null {
  if (process.env.AURACALL_SYSTEM_CONFIG_PATH) {
    return process.env.AURACALL_SYSTEM_CONFIG_PATH;
  }
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData;
    return programData ? path.join(programData, 'auracall', 'config.json') : null;
  }
  return '/etc/auracall/config.json';
}

function resolveProjectConfigPaths(cwd: string): string[] {
  const entries: string[] = [];
  let current = path.resolve(cwd);
  let prev = '';
  while (current !== prev) {
    entries.push(path.join(current, '.auracall', 'config.json'));
    entries.push(path.join(current, 'auracall.config.json'));
    entries.push(path.join(current, 'oracle.config.json'));
    prev = current;
    current = path.dirname(current);
  }
  return entries;
}

export interface LoadConfigResult {
  config: UserConfig;
  path: string;
  loaded: boolean;
  sources?: {
    system?: string | null;
    user?: string;
    project?: string[];
  };
}

export async function loadUserConfig(
  cwd: string = process.cwd(),
): Promise<LoadConfigResult> {
  const systemPath = resolveSystemConfigPath();
  const userPath = resolveUserConfigPath();
  const projectPaths = resolveProjectConfigPaths(cwd);
  const configs: Array<{ path: string; config: UserConfig }> = [];
  if (systemPath) {
    const systemConfig = await readConfigFile(systemPath);
    if (systemConfig) configs.push(systemConfig);
  }
  const userConfig = await readConfigFile(userPath);
  if (userConfig) configs.push(userConfig);
  const projectConfigs: Array<{ path: string; config: UserConfig }> = [];
  for (const projectPath of projectPaths) {
    const projectConfig = await readConfigFile(projectPath);
    if (projectConfig) projectConfigs.push(projectConfig);
  }
  projectConfigs.reverse();
  configs.push(...projectConfigs);
  if (configs.length === 0) {
    const scaffolded = await scaffoldDefaultConfigFile({ path: userPath, force: false });
    if (scaffolded) {
      configs.push(scaffolded);
    }
  }
  const merged = configs.reduce<UserConfig>((acc, next) => mergeConfig(acc, next.config), {} as UserConfig);
  const loaded = configs.length > 0;
  return {
    config: await applyDesktopProfileAssignments(merged),
    path: userPath,
    loaded,
    sources: {
      system: systemPath,
      user: userPath,
      project: projectPaths,
    },
  };
}
export function configPath(): string {
  return resolveUserConfigPath();
}

async function readConfigFile(configPath: string): Promise<{ path: string; config: UserConfig } | null> {
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON5.parse(raw);
    // Note: We don't strict-validate here because config files are partial.
    // Validation happens in resolver.ts after merge.
    return { path: configPath, config: parsed as UserConfig };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return null;
    }
    console.warn(`Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function mergeConfig(base: UserConfig, override: UserConfig): UserConfig {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = merged[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = mergeConfig(
        existing as UserConfig,
        value as UserConfig,
      );
    } else {
      merged[key] = value;
    }
  }
  return merged as UserConfig;
}

export async function scaffoldDefaultConfigFile(options: {
  path?: string;
  force?: boolean;
  targetShape?: boolean;
} = {}): Promise<{ path: string; config: UserConfig } | null> {
  const userPath = options.path ?? resolveUserConfigPath();
  const force = Boolean(options.force);
  if (!force) {
    try {
      await fs.access(userPath);
      return null;
    } catch {
      // continue
    }
  }

  const discovered = discoverDefaultBrowserProfile({ preference: 'auto' });
  const browserProfileName = 'default';
  const browserProfile: Record<string, unknown> = {
    chromePath: discovered?.chromePath,
    profilePath: discovered?.userDataDir,
    profileName: discovered?.profileName,
    cookiePath: discovered?.cookiePath,
  };
  const scaffolded: UserConfig = {
    version: 2,
    globals: {},
    browserDefaults: {},
    llmDefaults: {
      model: DEFAULT_MODEL,
    },
    model: DEFAULT_MODEL,
    browser: {},
    services: {
      chatgpt: { url: CHATGPT_URL },
      gemini: { url: GEMINI_URL },
      grok: { url: GROK_URL },
    },
    auracallProfile: 'default',
    profiles: {},
  };
  setBrowserProfile(scaffolded as Record<string, unknown>, browserProfileName, browserProfile);
  const defaultRuntimeProfile: Record<string, unknown> = {
    engine: 'browser',
    defaultService: 'chatgpt',
    browser: {},
    llm: {},
    services: {},
    cache: {
      store: 'dual',
      includeHistory: true,
      includeProjectOnlyConversations: true,
      historyLimit: 2000,
      cleanupDays: 365,
      refreshHours: 6,
      useDetectedIdentity: false,
    },
  };
  setRuntimeProfileBrowserProfile(defaultRuntimeProfile, browserProfileName);
  setRuntimeProfile(scaffolded as Record<string, unknown>, 'default', defaultRuntimeProfile);

  const writtenConfig = materializeConfigV2(scaffolded, {
    targetShape: options.targetShape ?? true,
  }) as UserConfig;

  await fs.mkdir(path.dirname(userPath), { recursive: true });
  await fs.writeFile(userPath, `${JSON.stringify(writtenConfig, null, 2)}\n`, 'utf8');
  return { path: userPath, config: writtenConfig };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
