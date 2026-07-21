import type { DeploymentMethod } from '@prisma/client';
import { addDeploymentJob } from '../../lib/deployment-queue.js';
import { prisma } from '../../lib/prisma.js';

export class DeploymentQueueError extends Error {}

export async function createQueuedDeployment(input: {
  projectId: string;
  branch: string;
  commit?: string | null;
  externalRunId?: string | null;
  runAttempt?: number | null;
  triggerMethod: DeploymentMethod;
  logMessage: string;
}) {
  if (input.externalRunId) {
    const duplicate = await prisma.deployment.findFirst({
      where: {
        projectId: input.projectId,
        externalRunId: input.externalRunId,
        runAttempt: input.runAttempt ?? 1,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) return { deployment: duplicate, reused: true };
  }

  const deployment = await prisma.deployment.create({
    data: {
      projectId: input.projectId,
      source: 'GITHUB',
      branch: input.branch,
      commitSha: input.commit || null,
      externalRunId: input.externalRunId || null,
      runAttempt: input.runAttempt ?? 1,
      triggerMethod: input.triggerMethod,
      status: 'QUEUED',
    },
  });

  await prisma.$transaction([
    prisma.project.update({ where: { id: input.projectId }, data: { status: 'DEPLOYING' } }),
    prisma.deploymentLog.create({ data: { deploymentId: deployment.id, level: 'info', message: input.logMessage } }),
  ]);

  try {
    await addDeploymentJob({ deploymentId: deployment.id, projectId: input.projectId, commit: input.commit });
  } catch (error) {
    await prisma.$transaction([
      prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED', finishedAt: new Date() } }),
      prisma.project.update({ where: { id: input.projectId }, data: { status: 'QUEUE_FAILED' } }),
      prisma.deploymentLog.create({
        data: { deploymentId: deployment.id, level: 'error', message: 'Deploy OS could not add this deployment to the runner queue.' },
      }),
    ]).catch(() => undefined);
    throw new DeploymentQueueError(error instanceof Error ? error.message : 'Deployment queue is unavailable.');
  }

  return { deployment, reused: false };
}
