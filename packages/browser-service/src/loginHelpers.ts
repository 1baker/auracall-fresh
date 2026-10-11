import CDP from './guardedCdp.js';
import type { CookieParam } from './types.js';
import { delay } from './utils.js';
import { buildWslFirewallHint } from './chromeLifecycle.js';
import { isPortOpen } from './processCheck.js';
import {
  isWindowsPath,
  isWslEnvironment,
  toWindowsPath as translateToWindowsPath,
  toWslPath,
} from './platformPaths.js';
import { resolveChromeEndpoint } from './windowsLoopbackRelay.js';

export function inferProfileFromCookiePath(cookiePath: string): { userDataDir: string; profileDir: string } | null {
  const normalized = normalizeCookiePath(cookiePath);
  const parts = normalized.split('/').filter(Boolean);
  const userDataIndex = parts.findIndex((part) => part.toLowerCase() === 'user data');
  if (userDataIndex !== -1 && userDataIndex + 1 < parts.length) {
    const prefix = normalized.startsWith('/') ? '/' : '';
    const userDataDir = `${prefix}${parts.slice(0, userDataIndex + 1).join('/')}`;
    const profileDir = parts[userDataIndex + 1];
    if (profileDir) {
      return { userDataDir, profileDir };
    }
  }

  const networkIndex = parts.findIndex((part) => part.toLowerCase() === 'network');
  if (networkIndex > 0 && parts[networkIndex + 1]?.toLowerCase() === 'cookies') {
    const profileDir = parts[networkIndex - 1];
    const prefix = normalized.startsWith('/') ? '/' : '';
    const userDataDir = `${prefix}${parts.slice(0, networkIndex - 1).join('/')}`;
    if (profileDir && userDataDir) {
      return { userDataDir, profileDir };
    }
  }

  if (parts.at(-1)?.toLowerCase() === 'cookies' && parts.length >= 2) {
    const profileDir = parts.at(-2);
    const prefix = normalized.startsWith('/') ? '/' : '';
    const userDataDir = `${prefix}${parts.slice(0, -2).join('/')}`;
    if (profileDir && userDataDir) {
      return { userDataDir, profileDir };
    }
  }

  return null;
}

function normalizeCookiePath(cookiePath: string): string {
  const normalized = isWslEnvironment() ? toWslPath(cookiePath) : cookiePath;
  return normalized.replace(/\\/g, '/');
}

export function isWsl(): boolean {
  return isWslEnvironment();
}

export function toWindowsPath(value: string): string {
  if (!isWslEnvironment()) {
    return value;
  }
  return translateToWindowsPath(value);
}

export function isWindowsChromePath(value: string): boolean {
  return isWindowsPath(value);
}

export function quotePowerShellLiteral(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

export async function waitForPortOpen(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }
    await delay(200);
  }
  const hint = buildWslFirewallHint(host, port);
  const message = hint
    ? `Timed out waiting for Chrome debug port ${host}:${port}. ${hint}`
    : `Timed out waiting for Chrome debug port ${host}:${port}.`;
  throw new Error(message);
}

export async function exportCookiesFromCdp({
  port,
  host = '127.0.0.1',
  requiredNames,
  urls,
  timeoutMs,
  signedOutProbe,
  signedOutRecovery,
}: {
  port: number | null;
  host?: string;
  requiredNames: string[];
  urls: string[];
  timeoutMs: number;
  signedOutProbe?: {
    expression: string;
    errorMessage: string;
  };
  signedOutRecovery?: {
    expression: string;
    attemptLimit?: number;
    graceMs?: number;
  };
}): Promise<CookieParam[]> {
  if (!port) {
    throw new Error('Missing Chrome debug port for cookie export.');
  }
  const endpoint = await resolveChromeEndpoint(host, port);
  const client = await CDP({ port: endpoint.port, host: endpoint.host });
  try {
    await client.Network.enable();
    await client.Runtime.enable();
    const start = Date.now();
    const recoveryAttemptLimit = Math.max(0, signedOutRecovery?.attemptLimit ?? 1);
    const recoveryGraceMs = Math.max(0, signedOutRecovery?.graceMs ?? 15_000);
    let signedOutRecoveryAttempts = 0;
    let signedOutRecoveryGraceUntil = 0;
    while (Date.now() - start < timeoutMs) {
      const { cookies } = await client.Network.getCookies({ urls });
      const hasRequired = requiredNames.every((name) => cookies.some((cookie) => cookie.name === name));
      if (hasRequired) {
        return cookies.map(mapCookieToParam);
      }
      if (signedOutProbe) {
        const probe = await client.Runtime.evaluate({
          expression: signedOutProbe.expression,
          returnByValue: true,
        });
        if (probe.result?.value === true) {
          if (signedOutRecovery && signedOutRecoveryAttempts < recoveryAttemptLimit) {
            const recovery = await client.Runtime.evaluate({
              expression: signedOutRecovery.expression,
              returnByValue: true,
            });
            if (recovery.result?.value === true) {
              signedOutRecoveryAttempts += 1;
              signedOutRecoveryGraceUntil = Date.now() + recoveryGraceMs;
              await delay(2_000);
              continue;
            }
          }
          if (Date.now() < signedOutRecoveryGraceUntil) {
            await delay(2_000);
            continue;
          }
          throw new Error(signedOutProbe.errorMessage);
        }
      }
      await delay(2_000);
    }
    throw new Error(`Timed out waiting for cookies: ${requiredNames.join(', ')}`);
  } finally {
    await client.close();
    await endpoint.dispose?.().catch(() => undefined);
  }
}

function mapCookieToParam(cookie: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CookieParam['sameSite'];
  priority?: CookieParam['priority'];
  sameParty?: boolean;
}): CookieParam {
  const param: CookieParam = {
    name: cookie.name,
    value: cookie.value,
  };
  if (cookie.domain) param.domain = cookie.domain;
  if (cookie.path) param.path = cookie.path;
  if (typeof cookie.expires === 'number') param.expires = cookie.expires;
  if (typeof cookie.httpOnly === 'boolean') param.httpOnly = cookie.httpOnly;
  if (typeof cookie.secure === 'boolean') param.secure = cookie.secure;
  if (cookie.sameSite) param.sameSite = cookie.sameSite;
  if (cookie.priority) param.priority = cookie.priority;
  if (typeof cookie.sameParty === 'boolean') param.sameParty = cookie.sameParty;
  return param;
}
