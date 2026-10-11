#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface InstallOptions {
  prefix: string;
  binDir: string;
  dryRun: boolean;
  skipBuild: boolean;
}

const PACKAGE_NAME = 'auracall';
const BINARIES = ['auracall', 'auracall-mcp'] as const;

function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv: string[]): InstallOptions {
  const options: InstallOptions = {
    prefix: path.join(os.homedir(), '.auracall', 'user-runtime'),
    binDir: path.join(os.homedir(), '.local', 'bin'),
    dryRun: false,
    skipBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--skip-build') {
      options.skipBuild = true;
      continue;
    }
    if (arg === '--prefix') {
      const value = argv[index + 1];
      if (!value) throw new Error('--prefix requires a path.');
      options.prefix = path.resolve(expandHome(value));
      index += 1;
      continue;
    }
    if (arg === '--bin-dir') {
      const value = argv[index + 1];
      if (!value) throw new Error('--bin-dir requires a path.');
      options.binDir = path.resolve(expandHome(value));
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`Install the current checkout as a user-scoped Aura-Call runtime.

Usage:
  pnpm tsx scripts/install-user-runtime.ts [options]

Options:
  --prefix <path>   Install prefix. Default: ~/.auracall/user-runtime
  --bin-dir <path>  Wrapper directory. Default: ~/.local/bin
  --skip-build      Reuse existing dist/ instead of running pnpm run build
  --dry-run         Print actions without changing files
  -h, --help        Show this help
`);
}

function run(command: string, args: string[], options: { cwd?: string; dryRun?: boolean } = {}): string {
  const rendered = [command, ...args].join(' ');
  if (options.dryRun) {
    console.log(`[dry-run] ${rendered}`);
    return '';
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${rendered}`);
  }
  return result.stdout.trim();
}

function writeWrapper(binDir: string, binary: (typeof BINARIES)[number], installedBinPath: string, dryRun: boolean): void {
  const wrapperPath = path.join(binDir, binary);
  const script = `#!/usr/bin/env sh
exec node ${JSON.stringify(installedBinPath)} "$@"
`;
  if (dryRun) {
    console.log(`[dry-run] write ${wrapperPath} -> ${installedBinPath}`);
    return;
  }
  fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auracall-user-runtime-pack-'));

  console.log(`User runtime prefix: ${options.prefix}`);
  console.log(`Wrapper directory: ${options.binDir}`);

  try {
    if (!options.skipBuild) {
      run('pnpm', ['run', 'build'], { cwd: repoRoot, dryRun: options.dryRun });
    }

    // A green launch-policy build must not remove the deployed desktop client.
    // Verify actual compiled HTTP behavior before removing any install prefix.
    run('node', [path.join(repoRoot, 'dist/scripts/verify-runtime-contract.js'), repoRoot], {
      cwd: repoRoot, dryRun: options.dryRun,
    });

    let tarballPath = path.join(packDir, 'auracall-package.tgz');
    let tarballName: string | null = null;
    if (options.dryRun) {
      run('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot, dryRun: true });
    } else {
      const packOutput = run('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot });
      tarballName = packOutput.split(/\r?\n/).filter(Boolean).at(-1) ?? null;
      if (!tarballName) {
        throw new Error('npm pack did not report a tarball name.');
      }
      tarballPath = path.join(packDir, tarballName);
    }

    if (options.dryRun) {
      console.log(`[dry-run] remove ${options.prefix}`);
      console.log(`[dry-run] create ${options.prefix}`);
      console.log(`[dry-run] create ${options.binDir}`);
    } else {
      fs.rmSync(options.prefix, { recursive: true, force: true });
      fs.mkdirSync(options.prefix, { recursive: true });
      fs.mkdirSync(options.binDir, { recursive: true });
    }

    run(
      'npm',
      ['install', '--prefix', options.prefix, '--omit=dev', '--no-audit', '--no-fund', tarballPath],
      { cwd: repoRoot, dryRun: options.dryRun },
    );

    const installedBinaryPaths = new Map<(typeof BINARIES)[number], string>();
    for (const binary of BINARIES) {
      const installedBinPath = path.join(options.prefix, 'node_modules', PACKAGE_NAME, 'dist', 'bin', `${binary}.js`);
      installedBinaryPaths.set(binary, installedBinPath);
      writeWrapper(options.binDir, binary, installedBinPath, options.dryRun);
    }
    const installedAuracallPath = installedBinaryPaths.get('auracall');
    if (!installedAuracallPath) {
      throw new Error('Installed Aura-Call CLI path was not recorded.');
    }
    run('node', [installedAuracallPath, '--version'], {
      cwd: repoRoot,
      dryRun: options.dryRun,
    });

    const metadata = {
      packageName: PACKAGE_NAME,
      installedAt: new Date().toISOString(),
      packageVersion: packageJson.version ?? null,
      sourceRepo: repoRoot,
      prefix: options.prefix,
      binDir: options.binDir,
      tarballFile: tarballName,
    };
    if (options.dryRun) {
      console.log(`[dry-run] write ${path.join(options.prefix, 'auracall-user-runtime.json')}`);
    } else {
      fs.writeFileSync(path.join(options.prefix, 'auracall-user-runtime.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    }

    console.log(`Installed user-scoped Aura-Call runtime.`);
    console.log(`Run: ${path.join(options.binDir, 'auracall')} --version`);
  } finally {
    if (!options.dryRun) {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
