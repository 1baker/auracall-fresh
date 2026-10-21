import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  buildChromeFlags,
  parseWslResolverHost,
  probeChromeDebuggerPort,
  resolveChromeLauncherTempPrefix,
  resolveUserDataBaseDir,
  resolveUserDataDirFlag,
  resolveWslHost,
  runAbortableBrowserLaunch,
} from '../../packages/browser-service/src/chromeLifecycle.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe('chromeLifecycle (package)', () => {
  test('resolveWslHost prefers explicit env override', () => {
    process.env.BROWSER_SERVICE_BROWSER_REMOTE_DEBUG_HOST = '10.0.0.5';
    expect(resolveWslHost()).toBe('10.0.0.5');
  });

  test.each(['127.0.0.53', '127.0.0.54', '127.12.34.56'])(
    'maps resolver-derived loopback host %s to local Chrome',
    (host) => {
      expect(parseWslResolverHost(`nameserver ${host}\n`)).toBe('127.0.0.1');
    },
  );

  test('preserves a resolver-derived non-loopback host', () => {
    expect(parseWslResolverHost('nameserver 172.28.224.1\n')).toBe('172.28.224.1');
  });

  test('resolveUserDataBaseDir keeps WSL Chrome on the Linux temp root', async () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    await expect(resolveUserDataBaseDir('/usr/bin/google-chrome')).resolves.toBe(os.tmpdir());
  });

  test('resolveChromeLauncherTempPrefix keeps WSL launcher bookkeeping out of the working tree', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    expect(resolveChromeLauncherTempPrefix('/usr/bin/google-chrome')).toBe(
      path.join(os.tmpdir(), 'auracall-chrome-launcher-'),
    );
    expect(
      resolveChromeLauncherTempPrefix('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'),
    ).toBeNull();
  });

  test('resolveUserDataDirFlag wraps Windows WSL paths in quotes for chrome.exe', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    expect(
      resolveUserDataDirFlag(
        '/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok',
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      ),
    ).toBe('"C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\windows-chrome-test\\grok"');
  });

  test('endpoint-only startup suppresses initial windows and session restoration', () => {
    const flags = buildChromeFlags(false, null, 'Default', { minimal: true, suppressStartupWindow: true });
    expect(flags).toContain('--no-startup-window');
    expect(flags).not.toContain('--new-window');
    expect(buildChromeFlags(false, null, 'Default', { minimal: true })).toContain('--new-window');
  });

  test('buildChromeFlags adds start-minimized when hideWindow launches headful Chrome', () => {
    expect(buildChromeFlags(false, null, 'Default', { startMinimized: true })).toContain('--start-minimized');
    expect(buildChromeFlags(true, null, 'Default', { startMinimized: true })).not.toContain('--start-minimized');
  });

  test('buildChromeFlags anchors visible minimal login windows on screen', () => {
    const visibleFlags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });
    expect(visibleFlags).toContain('--window-position=0,0');
    expect(visibleFlags).toContain('--window-size=1400,1000');

    const minimizedFlags = buildChromeFlags(false, null, 'Profile 1', {
      minimal: true,
      startMinimized: true,
    });
    expect(minimizedFlags).toContain('--start-minimized');
    expect(minimizedFlags).not.toContain('--window-position=0,0');
  });

  test.runIf(process.platform !== 'win32')(
    'buildChromeFlags bypasses desktop keyring prompts for minimal managed launches',
    () => {
      const flags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });

      expect(flags).toContain('--password-store=basic');
      expect(flags).toContain('--use-mock-keychain');
      expect(flags.filter((flag) => flag === '--password-store=basic')).toHaveLength(1);
      expect(flags.filter((flag) => flag === '--use-mock-keychain')).toHaveLength(1);
    },
  );

  test.runIf(process.platform !== 'win32')(
    'buildChromeFlags keeps desktop keyring bypass enabled inside WSL',
    () => {
      process.env.WSL_DISTRO_NAME = 'Ubuntu';

      const flags = buildChromeFlags(false, null, 'Profile 1', { minimal: true });

      expect(flags).toContain('--password-store=basic');
      expect(flags).toContain('--use-mock-keychain');
    },
  );

  test('joins browser-launch cleanup before rejecting an abort', async () => {
    const controller = new AbortController();
    let cleanupFinished = false;
    let cleanupCount = 0;
    let rejectLaunch: ((reason: Error) => void) | undefined;
    let launchSettled = false;
    const launch = new Promise<void>((_resolve, reject) => {
      rejectLaunch = reject;
    }).finally(() => {
      launchSettled = true;
    });
    const result = runAbortableBrowserLaunch({
      launch: () => launch,
      cleanup: async () => {
        cleanupCount += 1;
        await Promise.resolve();
        cleanupFinished = true;
        setTimeout(() => rejectLaunch?.(new Error('launcher stopped')), 10);
      },
      abortSignal: controller.signal,
    });

    await Promise.resolve();
    controller.abort(new Error('context deadline'));

    await expect(result).rejects.toThrow('context deadline');
    expect(cleanupFinished).toBe(true);
    expect(launchSettled).toBe(true);
    expect(cleanupCount).toBe(1);
  });

  test('interrupts a pending debugger probe without waiting for its transport', async () => {
    const controller = new AbortController();
    const probe = probeChromeDebuggerPort({
      host: '127.0.0.1',
      port: 45015,
      abortSignal: controller.signal,
      probe: () => new Promise<boolean>(() => undefined),
    });

    controller.abort(new Error('context deadline'));

    await expect(probe).rejects.toThrow('context deadline');
  });

  test('classifies an unready debugger without claiming an unobserved browser exit', async () => {
    await expect(probeChromeDebuggerPort({
      host: '127.0.0.1',
      port: 45015,
      probe: async () => false,
    })).rejects.toMatchObject({ code: 'BROWSER_CDP_NOT_READY', recoveryAction: 'inspect_browser_launch_diagnostics', message: expect.stringContaining('Browser exit is not proven') });
  });

  test('returns a completed browser launch without cleanup', async () => {
    let cleanupCount = 0;

    await expect(runAbortableBrowserLaunch({
      launch: async () => 'launched',
      cleanup: () => {
        cleanupCount += 1;
      },
      abortSignal: new AbortController().signal,
    })).resolves.toBe('launched');
    expect(cleanupCount).toBe(0);
  });

  test('does not start a browser launch after cancellation', async () => {
    const controller = new AbortController();
    let launchCount = 0;
    let cleanupCount = 0;
    controller.abort(new Error('cancelled before launch'));

    await expect(runAbortableBrowserLaunch({
      launch: async () => {
        launchCount += 1;
      },
      cleanup: () => {
        cleanupCount += 1;
      },
      abortSignal: controller.signal,
    })).rejects.toThrow('cancelled before launch');
    expect(launchCount).toBe(0);
    expect(cleanupCount).toBe(1);
  });

  test('does not start a deferred browser launch when cancellation wins the first microtask', async () => {
    const controller = new AbortController();
    let launchCount = 0;
    let cleanupCount = 0;
    const result = runAbortableBrowserLaunch({
      launch: async () => {
        launchCount += 1;
      },
      cleanup: () => {
        cleanupCount += 1;
      },
      abortSignal: controller.signal,
    });

    controller.abort(new Error('cancelled before deferred launch'));

    await expect(result).rejects.toThrow('cancelled before deferred launch');
    expect(launchCount).toBe(0);
    expect(cleanupCount).toBe(1);
  });
});
