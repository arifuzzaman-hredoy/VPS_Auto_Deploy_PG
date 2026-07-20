import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFramework } from '@techteam/framework-detector';
import { generateDockerfile } from '@techteam/dockerfile-generator';
import { runCommand } from '../lib/shell.js';
import { prisma } from '../lib/prisma.js';

interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  commit: string;
}

async function writeDeploymentLog(deploymentId: string, level: string, message: string): Promise<void> {
  await prisma.deploymentLog.create({
    data: { deploymentId, level, message },
  });
}

export async function runDeploymentJob(data: DeploymentJobData): Promise<void> {
  const workspaceRoot = process.env.RUNNER_WORKSPACE ?? '/opt/techteam-deploy/projects';
  const repoDir = join(workspaceRoot, data.projectId, 'repo');
  mkdirSync(repoDir, { recursive: true });

  await prisma.deployment.update({
    where: { id: data.deploymentId },
    data: { status: 'FRAMEWORK_DETECTED', startedAt: new Date() },
  });
  await writeDeploymentLog(data.deploymentId, 'info', `Deployment started for commit ${data.commit}.`);

  try {
    const plan = detectFramework(repoDir);
    await writeDeploymentLog(
      data.deploymentId,
      'info',
      `Framework detected: ${plan.framework}. Docker strategy: ${plan.dockerStrategy}.`,
    );

    if (plan.dockerStrategy === 'generated-dockerfile') {
      writeFileSync(join(repoDir, 'Dockerfile.deployos'), generateDockerfile(plan));
      await writeDeploymentLog(data.deploymentId, 'info', 'Generated Dockerfile.deployos.');
    }

    const tag = `hredoy/${data.projectId}:${data.commit.slice(0, 12)}`;
    const dockerfile = plan.dockerStrategy === 'generated-dockerfile' ? 'Dockerfile.deployos' : 'Dockerfile';

    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'BUILDING_IMAGE', imageTag: tag },
    });
    await writeDeploymentLog(data.deploymentId, 'info', `Building Docker image ${tag}.`);
    await runCommand('docker', ['build', '-f', dockerfile, '-t', tag, '.'], repoDir);
    await writeDeploymentLog(data.deploymentId, 'info', 'Docker image build completed.');

    const containerName = `${data.projectId}-${data.commit.slice(0, 12)}`;
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'STARTING_CONTAINER', containerName },
    });
    await writeDeploymentLog(data.deploymentId, 'info', `Starting container ${containerName}.`);

    await runCommand('docker', ['rm', '-f', containerName]).catch(() => ({ stdout: '', stderr: '' }));
    await runCommand('docker', [
      'run', '-d',
      '--name', containerName,
      '--network', process.env.RUNNER_DOCKER_NETWORK ?? 'techteam-deploy-network',
      '--memory', process.env.RUNNER_MEMORY_LIMIT ?? '1g',
      '--cpus', process.env.RUNNER_CPU_LIMIT ?? '1',
      tag,
    ]);

    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'HEALTH_CHECKING', finishedAt: new Date() },
    });
    await writeDeploymentLog(
      data.deploymentId,
      'info',
      `Container ${containerName} started. Health check and proxy activation are the next required steps.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown deployment worker error.';
    await prisma.deployment.update({
      where: { id: data.deploymentId },
      data: { status: 'FAILED', finishedAt: new Date() },
    });
    await writeDeploymentLog(data.deploymentId, 'error', message);
    throw error;
  }
}
