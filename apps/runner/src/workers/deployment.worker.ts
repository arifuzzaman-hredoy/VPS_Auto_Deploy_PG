import { chmodSync, closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { detectFramework } from '@techteam/framework-detector';
import { generateDockerfile } from '@techteam/dockerfile-generator';
import { decryptSecret } from '../lib/crypto.js';
import { activateNginxRoute, type NginxRouteHandle } from '../lib/nginx.js';
import { findAvailablePort } from '../lib/ports.js';
import { runCommand } from '../lib/shell.js';
import type { DeploymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  commit: string;
}

async function writeDeploymentLog(deploymentId: string, level: string, message: string): Promise<void> {
  const safeMessage = message.trim().slice(0, 6000);
  if (!safeMessage) return;
  await prisma.deploymentLog.create({ data: { deploymentId, level, message: safeMessage } });
}

async function setStatus(deploymentId: string, status: DeploymentStatus): Promise<void> {
  await prisma.deployment.update({ where: { id: deploymentId }, data: { status } });
}

function repositorySshUrl(fullName: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) throw new Error('Project repositoryFullName is invalid.');
  return `git@github.com:${fullName}.git`;
}

function serializeRuntimeEnv(values: Array<{ key: string; value: string }>): string {
  return values
    .map(({ key, value }) => `${key}=${value.replace(/\r?\n/g, '\\n')}`)
    .join('\n') + '\n';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireProjectLock(projectRoot: string, deploymentId: string): Promise<() => void> {
  const lockPath = join(projectRoot, '.deploy.lock');
  const maxWaitMs = Number(process.env.RUNNER_PROJECT_LOCK_WAIT_MS ?? 1_800_000);
  const staleMs = Number(process.env.RUNNER_PROJECT_LOCK_STALE_MS ?? 7_200_000);
  const startedAt = Date.now();
  let announced = false;

  mkdirSync(projectRoot, { recursive: true });

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify({ deploymentId, pid: process.pid, acquiredAt: new Date().toISOString() }));
      closeSync(fd);
      return () => rmSync(lockPath, { force: true });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
      if (code !== 'EEXIST') throw error;

      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }

      if (!announced) {
        announced = true;
        await writeDeploymentLog(deploymentId, 'info', 'Another deployment for this project is active. Waiting for the project lock.');
      }
      await wait(2000);
    }
  }

  throw new Error('Timed out waiting for another deployment of this project to finish.');
}

async function runLogged(
  deploymentId: string,
  label: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<void> {
  await writeDeploymentLog(deploymentId, 'info', label);
  let buffer = '';
  let lastFlush = Date.now();
  const flush = async () => {
    const value = buffer.trim();
    buffer = '';
    lastFlush = Date.now();
    if (value) await writeDeploymentLog(deploymentId, 'output', value.slice(-5000));
  };

  await runCommand(command, args, {
    ...options,
    onOutput: async (_stream, text) => {
      buffer += text;
      if (buffer.length >= 4000 || Date.now() - lastFlush > 2000) await flush();
    },
  });
  await flush();
}

async function waitForHealth(url: string, attempts = 45): Promise<void> {
  let lastError = 'No response';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (response.status >= 200 && response.status < 400) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(2000);
  }
  throw new Error(`Health check failed for ${url}: ${lastError}`);
}

export async function runDeploymentJob(data: DeploymentJobData): Promise<void> {
  const workspaceRoot = process.env.RUNNER_WORKSPACE ?? '/opt/hredoy-deploy/projects';
  const projectRoot = join(workspaceRoot, data.projectId);
  const repoDir = join(projectRoot, 'repo');
  const secretDir = join(projectRoot, 'secrets');
  const keyPath = join(secretDir, `${data.deploymentId}.key`);
  const runtimeEnvPath = join(secretDir, `${data.deploymentId}.env`);
  const buildEnvPath = join(secretDir, `${data.deploymentId}.build-env.json`);
  mkdirSync(secretDir, { recursive: true, mode: 0o700 });

  let releaseProjectLock: (() => void) | undefined;
  let newContainerName = '';
  let imageTag = '';
  let routeHandle: NginxRouteHandle | undefined;
  let hadLiveDeployment = false;

  try {
    releaseProjectLock = await acquireProjectLock(projectRoot, data.deploymentId);

    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'CREATED', startedAt: new Date(), finishedAt: null },
    });
    await writeDeploymentLog(data.deploymentId, 'info', `Deployment started for commit ${data.commit}.`);

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      include: {
        deployKeys: { where: { isActive: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        envVars: { where: { environment: 'production' }, orderBy: { key: 'asc' } },
        databases: { orderBy: { createdAt: 'desc' }, take: 1 },
        domains: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        deployments: {
          where: { status: 'LIVE', id: { not: data.deploymentId } },
          orderBy: { liveAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!project) throw new Error('Project no longer exists.');
    if (!project.repositoryFullName) throw new Error('Project repository is not normalized. Save the project again.');

    const rootDirectory = project.rootDirectory || '.';
    const appDir = resolve(repoDir, rootDirectory);
    const resolvedRepoDir = resolve(repoDir);
    if (appDir !== resolvedRepoDir && !appDir.startsWith(`${resolvedRepoDir}${sep}`)) {
      throw new Error('Project root directory resolves outside the repository.');
    }

    const previous = project.deployments[0];
    hadLiveDeployment = Boolean(previous);
    const activeKey = project.deployKeys[0];
    const gitEnv: NodeJS.ProcessEnv = {};
    let cloneUrl = project.repoUrl ?? repositorySshUrl(project.repositoryFullName);
    if (activeKey) {
      writeFileSync(keyPath, decryptSecret(activeKey.encryptedPrivateKey), { mode: 0o600 });
      chmodSync(keyPath, 0o600);
      cloneUrl = repositorySshUrl(project.repositoryFullName);
      gitEnv.GIT_SSH_COMMAND = `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
    }

    if (!existsSync(join(repoDir, '.git'))) {
      rmSync(repoDir, { recursive: true, force: true });
      mkdirSync(dirname(repoDir), { recursive: true });
      await runLogged(data.deploymentId, 'Cloning GitHub repository.', 'git', ['clone', '--no-checkout', cloneUrl, repoDir], {
        env: gitEnv,
        timeoutMs: 180_000,
      });
    } else {
      await runLogged(data.deploymentId, 'Refreshing repository remote.', 'git', ['remote', 'set-url', 'origin', cloneUrl], { cwd: repoDir, env: gitEnv });
    }

    await runLogged(data.deploymentId, `Fetching branch ${project.defaultBranch}.`, 'git', ['fetch', '--force', '--prune', 'origin', project.defaultBranch], {
      cwd: repoDir,
      env: gitEnv,
      timeoutMs: 180_000,
    });
    await runLogged(data.deploymentId, 'Verifying the requested commit belongs to the configured branch.', 'git', ['merge-base', '--is-ancestor', data.commit, `origin/${project.defaultBranch}`], { cwd: repoDir, env: gitEnv });
    await runLogged(data.deploymentId, `Checking out commit ${data.commit}.`, 'git', ['checkout', '--detach', '--force', data.commit], { cwd: repoDir, env: gitEnv });
    await runLogged(data.deploymentId, 'Cleaning repository workspace.', 'git', ['clean', '-fdx'], { cwd: repoDir, env: gitEnv });
    if (!existsSync(appDir)) throw new Error(`Configured root directory does not exist: ${rootDirectory}`);
    await setStatus(data.deploymentId, 'REPO_CLONED');

    const environmentValues: Array<{ key: string; value: string }> = project.envVars.map((variable: { key: string; encryptedValue: string }) => ({
      key: variable.key,
      value: decryptSecret(variable.encryptedValue),
    }));
    writeFileSync(runtimeEnvPath, serializeRuntimeEnv(environmentValues), { mode: 0o600 });
    writeFileSync(buildEnvPath, JSON.stringify(Object.fromEntries(environmentValues.map(({ key, value }) => [key, value]))), { mode: 0o600 });
    chmodSync(runtimeEnvPath, 0o600);
    chmodSync(buildEnvPath, 0o600);
    await writeDeploymentLog(data.deploymentId, 'info', `Loaded ${environmentValues.length} encrypted production environment variable(s).`);

    const plan = detectFramework(appDir);
    if (plan.dockerStrategy === 'manual-required') {
      throw new Error('Framework could not be detected. Add a Dockerfile or a supported package.json project.');
    }

    const installCommand = project.installCommand || plan.installCommand;
    const buildCommand = project.buildCommand || plan.buildCommand;
    const startCommand = project.startCommand || plan.startCommand;
    const containerPort = plan.framework === 'vite' || plan.framework === 'static' ? 80 : project.appPort || plan.port;
    if (plan.dockerStrategy === 'generated-dockerfile' && !['vite', 'static'].includes(plan.framework) && !startCommand.trim()) {
      throw new Error('No production start command was detected. Add a start script or configure the Start command field.');
    }

    await prisma.project.update({ where: { id: project.id }, data: { framework: plan.framework, status: 'BUILDING' } });
    await setStatus(data.deploymentId, 'FRAMEWORK_DETECTED');
    await writeDeploymentLog(
      data.deploymentId,
      'info',
      `Root=${rootDirectory}; detected ${plan.framework}; install="${installCommand || 'none'}", build="${buildCommand || 'none'}", start="${startCommand}", container port=${containerPort}.`,
    );

    let dockerfile = 'Dockerfile';
    if (plan.dockerStrategy !== 'custom-dockerfile') {
      dockerfile = 'Dockerfile.hredoy';
      writeFileSync(
        join(appDir, dockerfile),
        generateDockerfile(plan, { installCommand, buildCommand, startCommand, port: containerPort }),
      );
      if (!existsSync(join(appDir, '.dockerignore'))) {
        writeFileSync(join(appDir, '.dockerignore'), ['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.env', '.env.*', '*.log'].join('\n') + '\n');
      }
      await writeDeploymentLog(data.deploymentId, 'info', `Generated ${dockerfile}.`);
    }

    imageTag = `hredoy/${project.slug}:${data.commit.slice(0, 12).toLowerCase()}`;
    await prisma.deployment.update({ where: { id: data.deploymentId }, data: { status: 'BUILDING_IMAGE', imageTag } });
    await runLogged(
      data.deploymentId,
      `Building Docker image ${imageTag}.`,
      'docker',
      ['build', '--secret', `id=deploy_env,src=${buildEnvPath}`, '-f', dockerfile, '-t', imageTag, '.'],
      { cwd: appDir, timeoutMs: Number(process.env.RUNNER_BUILD_TIMEOUT_MS ?? 1_200_000) },
    );

    const database = project.databases[0];
    if (plan.hasPrisma && database && database.migrationMode !== 'SKIP') {
      await setStatus(data.deploymentId, 'DATABASE_MIGRATION');
      const migrationCommand = database.migrationMode === 'DB_PUSH'
        ? 'npx prisma db push --skip-generate'
        : 'npx prisma migrate deploy';
      await runLogged(
        data.deploymentId,
        `Running database migration: ${migrationCommand}.`,
        'docker',
        ['run', '--rm', '--network', process.env.RUNNER_DOCKER_NETWORK ?? 'techteam-deploy-network', '--env-file', runtimeEnvPath, imageTag, 'sh', '-lc', migrationCommand],
        { timeoutMs: 600_000 },
      );
    }

    const hostPort = await findAvailablePort(
      Number(process.env.RUNNER_PORT_RANGE_START ?? 20000),
      Number(process.env.RUNNER_PORT_RANGE_END ?? 29999),
    );
    newContainerName = `hredoy-${project.slug}-${data.commit.slice(0, 12).toLowerCase()}`;
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'STARTING_CONTAINER', containerName: newContainerName, hostPort },
    });

    await runCommand('docker', ['rm', '-f', newContainerName]).catch(() => ({ stdout: '', stderr: '' }));
    await runLogged(
      data.deploymentId,
      `Starting container ${newContainerName} on 127.0.0.1:${hostPort}.`,
      'docker',
      [
        'run', '-d',
        '--name', newContainerName,
        '--restart', 'unless-stopped',
        '--network', process.env.RUNNER_DOCKER_NETWORK ?? 'techteam-deploy-network',
        '--env-file', runtimeEnvPath,
        '-e', `PORT=${containerPort}`,
        '-p', `127.0.0.1:${hostPort}:${containerPort}`,
        '--memory', process.env.RUNNER_MEMORY_LIMIT ?? '1g',
        '--cpus', process.env.RUNNER_CPU_LIMIT ?? '1',
        '--label', `hredoy.deploy.project=${project.id}`,
        '--label', `hredoy.deploy.deployment=${data.deploymentId}`,
        imageTag,
      ],
      { timeoutMs: 120_000 },
    );

    await setStatus(data.deploymentId, 'HEALTH_CHECKING');
    const healthUrl = `http://127.0.0.1:${hostPort}${project.healthPath || '/'}`;
    await writeDeploymentLog(data.deploymentId, 'info', `Waiting for health check: ${healthUrl}.`);
    try {
      await waitForHealth(healthUrl, Number(process.env.RUNNER_HEALTH_ATTEMPTS ?? 45));
    } catch (error) {
      const containerLogs = await runCommand('docker', ['logs', '--tail', '200', newContainerName]).catch(() => ({ stdout: '', stderr: '' }));
      const output = `${containerLogs.stdout}\n${containerLogs.stderr}`.trim();
      if (output) await writeDeploymentLog(data.deploymentId, 'container', output.slice(-6000));
      throw error;
    }
    await writeDeploymentLog(data.deploymentId, 'info', 'Health check passed.');

    const verifiedDomains = project.domains.filter((domain: any) =>
      domain.ownershipStatus === 'VERIFIED' && domain.dnsStatus === 'POINTED' && !domain.hostname.startsWith('*.'),
    );
    const preferredDomain = verifiedDomains.find((domain: any) => domain.hostname === project.primaryDomain)
      ?? verifiedDomains.find((domain: any) => domain.isPrimary)
      ?? verifiedDomains[0];
    const appsDomain = process.env.DEPLOY_OS_APPS_DOMAIN?.trim().replace(/^\.+|\.+$/g, '');
    const routeHostname = preferredDomain?.hostname || (appsDomain ? `${project.slug}.${appsDomain}` : null);
    let liveUrl = `http://${process.env.DEPLOY_OS_VPS_IP ?? '127.0.0.1'}:${hostPort}`;

    if (routeHostname && (process.env.RUNNER_NGINX_ENABLED ?? 'true').toLowerCase() === 'true') {
      await setStatus(data.deploymentId, 'UPDATING_PROXY');
      await writeDeploymentLog(data.deploymentId, 'info', `Activating Nginx route for ${routeHostname}.`);
      routeHandle = await activateNginxRoute({ slug: project.slug, hostname: routeHostname, hostPort });
      const publicScheme = routeHandle.sslActive ? 'https' : (process.env.RUNNER_PUBLIC_SCHEME || 'http');
      liveUrl = `${publicScheme}://${routeHostname}`;
    } else {
      await writeDeploymentLog(data.deploymentId, 'warning', 'No verified/custom or default apps hostname is configured. Deployment is available through its host port.');
    }

    await prisma.$transaction([
      prisma.deployment.update({
        where: { id: data.deploymentId },
        data: { status: 'LIVE', routeHostname, liveAt: new Date(), finishedAt: new Date() },
      }),
      prisma.project.update({
        where: { id: project.id },
        data: { status: 'LIVE', liveUrl, framework: plan.framework },
      }),
      ...(preferredDomain
        ? [prisma.domain.update({
            where: { id: preferredDomain.id },
            data: { routeStatus: 'LIVE', status: 'LIVE', liveAt: new Date() },
          })]
        : []),
      ...(previous
        ? [prisma.deployment.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED' } })]
        : []),
    ]);

    if (previous?.containerName && previous.containerName !== newContainerName) {
      await runCommand('docker', ['rm', '-f', previous.containerName]).catch(() => ({ stdout: '', stderr: '' }));
      await writeDeploymentLog(data.deploymentId, 'info', `Removed previous container ${previous.containerName} after route switch.`);
    }

    await writeDeploymentLog(data.deploymentId, 'info', `Deployment is live: ${liveUrl}`).catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deployment worker error.';
    if (routeHandle) await routeHandle.rollback().catch(() => undefined);
    if (newContainerName) await runCommand('docker', ['rm', '-f', newContainerName]).catch(() => ({ stdout: '', stderr: '' }));
    if (imageTag && (process.env.RUNNER_REMOVE_FAILED_IMAGE ?? 'false').toLowerCase() === 'true') {
      await runCommand('docker', ['image', 'rm', '-f', imageTag]).catch(() => ({ stdout: '', stderr: '' }));
    }
    await prisma.$transaction([
      prisma.deployment.update({ where: { id: data.deploymentId }, data: { status: 'FAILED', finishedAt: new Date() } }),
      prisma.project.update({ where: { id: data.projectId }, data: { status: hadLiveDeployment ? 'LIVE' : 'DEPLOY_FAILED' } }),
    ]).catch(() => undefined);
    await writeDeploymentLog(data.deploymentId, 'error', message).catch(() => undefined);
    throw error;
  } finally {
    rmSync(keyPath, { force: true });
    rmSync(runtimeEnvPath, { force: true });
    rmSync(buildEnvPath, { force: true });
    releaseProjectLock?.();
  }
}
