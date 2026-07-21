import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetectionResult } from '@techteam/shared';

type PackageJson = Record<string, unknown> & {
  scripts?: Record<string, string>;
  main?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readJson(path: string): PackageJson {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    return {};
  }
}

function hasAny(root: string, names: string[]): boolean {
  return names.some((name) => existsSync(join(root, name)));
}

function detectPackageManager(root: string): FrameworkDetectionResult['packageManager'] {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  if (existsSync(join(root, 'package.json'))) return 'npm';
  return 'unknown';
}

function runScriptCommand(pm: FrameworkDetectionResult['packageManager'], script: string): string {
  if (pm === 'pnpm') return `pnpm run ${script}`;
  if (pm === 'yarn') return `yarn ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `npm run ${script}`;
}

function execCommand(pm: FrameworkDetectionResult['packageManager'], binaryAndArgs: string): string {
  if (pm === 'pnpm') return `pnpm exec ${binaryAndArgs}`;
  if (pm === 'yarn') return `yarn ${binaryAndArgs}`;
  if (pm === 'bun') return `bunx ${binaryAndArgs}`;
  return `npx --no-install ${binaryAndArgs}`;
}

function installCommand(root: string, pm: FrameworkDetectionResult['packageManager']): string {
  if (pm === 'pnpm') return 'pnpm install --frozen-lockfile';
  if (pm === 'yarn') return 'yarn install --frozen-lockfile';
  if (pm === 'bun') return 'bun install --frozen-lockfile';
  if (pm === 'npm') return existsSync(join(root, 'package-lock.json')) ? 'npm ci' : 'npm install';
  return '';
}

function scriptOrFallback(
  pkg: PackageJson,
  pm: FrameworkDetectionResult['packageManager'],
  script: string,
  fallback = '',
): string {
  return pkg.scripts?.[script] ? runScriptCommand(pm, script) : fallback;
}

function detectNodeStart(root: string, pkg: PackageJson, pm: FrameworkDetectionResult['packageManager']): string {
  if (pkg.scripts?.start) return runScriptCommand(pm, 'start');
  if (typeof pkg.main === 'string' && pkg.main.trim()) return `node ${pkg.main.trim()}`;
  if (existsSync(join(root, 'server.js'))) return 'node server.js';
  if (existsSync(join(root, 'index.js'))) return 'node index.js';
  return '';
}

export function detectFramework(root: string): FrameworkDetectionResult {
  const packageManager = detectPackageManager(root);
  const pkg = readJson(join(root, 'package.json'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const hasPrisma = existsSync(join(root, 'prisma', 'schema.prisma'));
  const workflowDetected = hasAny(root, ['.github/workflows/deploy.yml', '.github/workflows/deploy.yaml']);

  if (existsSync(join(root, 'Dockerfile'))) {
    return {
      framework: 'dockerfile',
      packageManager,
      installCommand: '',
      buildCommand: '',
      startCommand: '',
      port: 3000,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'custom-dockerfile',
    };
  }

  if ('next' in deps || hasAny(root, ['next.config.js', 'next.config.mjs', 'next.config.ts'])) {
    return {
      framework: 'nextjs',
      packageManager,
      installCommand: installCommand(root, packageManager),
      buildCommand: scriptOrFallback(pkg, packageManager, 'build', execCommand(packageManager, 'next build')),
      startCommand: scriptOrFallback(pkg, packageManager, 'start', execCommand(packageManager, 'next start')),
      port: 3000,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'generated-dockerfile',
    };
  }

  if (hasAny(root, ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) || 'vite' in deps) {
    return {
      framework: 'vite',
      packageManager,
      installCommand: installCommand(root, packageManager),
      buildCommand: scriptOrFallback(pkg, packageManager, 'build', execCommand(packageManager, 'vite build')),
      startCommand: '',
      port: 80,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'generated-dockerfile',
    };
  }

  if (existsSync(join(root, 'index.html')) && !existsSync(join(root, 'package.json'))) {
    return {
      framework: 'static',
      packageManager,
      installCommand: '',
      buildCommand: '',
      startCommand: '',
      port: 80,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'static',
    };
  }

  if (existsSync(join(root, 'package.json'))) {
    return {
      framework: 'nodejs',
      packageManager,
      installCommand: installCommand(root, packageManager),
      buildCommand: scriptOrFallback(pkg, packageManager, 'build'),
      startCommand: detectNodeStart(root, pkg, packageManager),
      port: 3000,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'generated-dockerfile',
    };
  }

  return {
    framework: 'unknown',
    packageManager,
    installCommand: '',
    buildCommand: '',
    startCommand: '',
    port: 3000,
    hasPrisma,
    databaseRequired: hasPrisma,
    workflowDetected,
    dockerStrategy: 'manual-required',
  };
}
