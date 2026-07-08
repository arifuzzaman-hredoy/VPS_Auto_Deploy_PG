import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FrameworkDetectionResult } from '@techteam/shared';

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
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
  if (existsSync(join(root, 'bun.lockb'))) return 'bun';
  if (existsSync(join(root, 'package-lock.json'))) return 'npm';
  if (existsSync(join(root, 'package.json'))) return 'npm';
  return 'unknown';
}

function installCommand(pm: FrameworkDetectionResult['packageManager']): string {
  if (pm === 'pnpm') return 'pnpm install --frozen-lockfile';
  if (pm === 'yarn') return 'yarn install --frozen-lockfile';
  if (pm === 'bun') return 'bun install --frozen-lockfile';
  if (pm === 'npm') return 'npm ci';
  return '';
}

export function detectFramework(root: string): FrameworkDetectionResult {
  const packageManager = detectPackageManager(root);
  const pkg = readJson(join(root, 'package.json'));
  const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, unknown>;
  const hasPrisma = existsSync(join(root, 'prisma', 'schema.prisma'));
  const workflowDetected = hasAny(root, ['.github/workflows/deploy.yml', '.github/workflows/deploy.yaml']);

  if (existsSync(join(root, 'Dockerfile'))) {
    return {
      framework: 'dockerfile',
      packageManager,
      installCommand: '',
      buildCommand: 'docker build',
      startCommand: 'docker run',
      port: 3000,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'custom-dockerfile'
    };
  }

  if ('next' in deps || hasAny(root, ['next.config.js', 'next.config.mjs', 'next.config.ts'])) {
    return {
      framework: 'nextjs',
      packageManager,
      installCommand: installCommand(packageManager),
      buildCommand: 'npm run build',
      startCommand: 'npm run start',
      port: 3000,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'generated-dockerfile'
    };
  }

  if (hasAny(root, ['vite.config.ts', 'vite.config.js']) || 'vite' in deps) {
    return {
      framework: 'vite',
      packageManager,
      installCommand: installCommand(packageManager),
      buildCommand: 'npm run build',
      startCommand: 'npm run preview -- --host 0.0.0.0',
      port: 4173,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'generated-dockerfile'
    };
  }

  if (existsSync(join(root, 'index.html'))) {
    return {
      framework: 'static',
      packageManager,
      installCommand: '',
      buildCommand: '',
      startCommand: 'static-server',
      port: 8080,
      hasPrisma,
      databaseRequired: hasPrisma,
      workflowDetected,
      dockerStrategy: 'static'
    };
  }

  return {
    framework: existsSync(join(root, 'package.json')) ? 'nodejs' : 'unknown',
    packageManager,
    installCommand: installCommand(packageManager),
    buildCommand: 'npm run build',
    startCommand: 'npm run start',
    port: 3000,
    hasPrisma,
    databaseRequired: hasPrisma,
    workflowDetected,
    dockerStrategy: existsSync(join(root, 'package.json')) ? 'generated-dockerfile' : 'manual-required'
  };
}
