import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { verifyDeployToken } from '../../lib/deploy-token.js';
import { prisma } from '../../lib/prisma.js';
import { normalizeRepositoryFullName } from '../../lib/repository.js';

const triggerSchema = z.object({
  projectSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  repository: z.string().min(3),
  branch: z.string().min(1).max(120),
  commit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  runId: z.coerce.string().optional(),
  runAttempt: z.coerce.number().int().min(1).optional(),
});

const connection = (() => {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    maxRetriesPerRequest: null,
  };
})();

const deploymentQueue = new Queue('deployments', { connection });

export async function deploymentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onClose', async () => { await deploymentQueue.close(); });

  app.post('/trigger', async (request, reply) => {
    const auth = request.headers.authorization;
    const token = auth?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return reply.code(401).send({ message: 'Missing DEPLOY_TOKEN.' });

    const payload = triggerSchema.parse(request.body);
    let repositoryFullName: string;
    try {
      repositoryFullName = normalizeRepositoryFullName(payload.repository);
    } catch (error) {
      return reply.code(400).send({ message: error instanceof Error ? error.message : 'Invalid repository.' });
    }

    const candidates = payload.projectSlug
      ? await prisma.project.findMany({ where: { slug: payload.projectSlug }, take: 1 })
      : await prisma.project.findMany({ where: { repositoryFullName } });

    if (candidates.length === 0) {
      return reply.code(404).send({
        message: payload.projectSlug
          ? `No Deploy OS project exists with slug ${payload.projectSlug}.`
          : 'No Deploy OS project is connected to this GitHub repository.',
      });
    }

    const project = candidates.find((candidate: { deployTokenHash: string | null }) =>
      Boolean(candidate.deployTokenHash && verifyDeployToken(token, candidate.deployTokenHash)),
    );

    if (!project) {
      return reply.code(401).send({ message: 'DEPLOY_TOKEN is invalid for this project.' });
    }
    if (project.repositoryFullName !== repositoryFullName) {
      return reply.code(409).send({
        message: `Workflow repository ${repositoryFullName} does not match project repository ${project.repositoryFullName ?? 'not configured'}.`,
      });
    }
    if (payload.branch !== project.defaultBranch) {
      return reply.code(409).send({
        message: `Branch ${payload.branch} is not configured for production. Expected ${project.defaultBranch}.`,
      });
    }

    if (payload.runId) {
      const duplicate = await prisma.deployment.findFirst({
        where: {
          projectId: project.id,
          externalRunId: payload.runId,
          runAttempt: payload.runAttempt ?? 1,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (duplicate) {
        return reply.code(202).send({ ok: true, deploymentId: duplicate.id, status: duplicate.status, reused: true });
      }
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        source: 'GITHUB',
        branch: payload.branch,
        commitSha: payload.commit,
        externalRunId: payload.runId,
        runAttempt: payload.runAttempt ?? 1,
        status: 'QUEUED',
      },
    });

    await prisma.project.update({ where: { id: project.id }, data: { status: 'DEPLOYING' } });
    await prisma.deploymentLog.create({
      data: {
        deploymentId: deployment.id,
        level: 'info',
        message: `Queued from GitHub Actions for ${repositoryFullName}@${payload.commit.slice(0, 12)}.`,
      },
    });

    try {
      await deploymentQueue.add(
        'deploy',
        { deploymentId: deployment.id, projectId: project.id, commit: payload.commit },
        {
          jobId: deployment.id,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      request.log.error({ err: error, deploymentId: deployment.id }, 'Deployment queue write failed');
      await prisma.$transaction([
        prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED', finishedAt: new Date() } }),
        prisma.project.update({ where: { id: project.id }, data: { status: 'QUEUE_FAILED' } }),
        prisma.deploymentLog.create({
          data: { deploymentId: deployment.id, level: 'error', message: 'Deploy OS could not add this deployment to the runner queue.' },
        }),
      ]).catch(() => undefined);
      return reply.code(503).send({ message: 'Deployment queue is unavailable. Try the GitHub Actions job again.' });
    }

    return reply.code(202).send({ ok: true, deploymentId: deployment.id, status: 'QUEUED', reused: false });
  });

  app.get('/project/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });
    return prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
  });

  app.get('/:deploymentId', async (request, reply) => {
    const { deploymentId } = request.params as { deploymentId: string };
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: { select: { id: true, name: true, slug: true, liveUrl: true } }, logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!deployment) return reply.code(404).send({ message: 'Deployment not found.' });
    return deployment;
  });

  app.get('/:deploymentId/logs', async (request) => {
    const { deploymentId } = request.params as { deploymentId: string };
    return prisma.deploymentLog.findMany({ where: { deploymentId }, orderBy: { createdAt: 'asc' } });
  });
}
