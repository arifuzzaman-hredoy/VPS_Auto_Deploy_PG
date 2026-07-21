import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyDeployToken } from '../../lib/deploy-token.js';
import { prisma } from '../../lib/prisma.js';
import { normalizeRepositoryFullName } from '../../lib/repository.js';
import { createQueuedDeployment, DeploymentQueueError } from './deployment.service.js';

const triggerSchema = z.object({
  projectSlug: z.string().trim().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  repository: z.string().min(3),
  branch: z.string().min(1).max(120),
  commit: z.string().regex(/^[a-f0-9]{7,64}$/i),
  runId: z.coerce.string().optional(),
  runAttempt: z.coerce.number().int().min(1).optional(),
});

const manualSchema = z.object({
  projectId: z.string().min(1),
  commit: z.string().trim().regex(/^[a-f0-9]{7,64}$/i).optional().nullable(),
});

export async function deploymentRoutes(app: FastifyInstance): Promise<void> {
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

    if (!project) return reply.code(401).send({ message: 'DEPLOY_TOKEN is invalid for this project.' });
    if (project.deploymentMethod !== 'GITHUB_ACTIONS') {
      return reply.code(409).send({ message: 'GitHub Actions is configured but not active for this project. Switch the project deployment method first.' });
    }
    if (!project.autoDeployEnabled) {
      return reply.code(409).send({ message: 'Automatic deployments are disabled for this project. Use Deploy now for a manual deployment.' });
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

    try {
      const result = await createQueuedDeployment({
        projectId: project.id,
        branch: payload.branch,
        commit: payload.commit,
        externalRunId: payload.runId ? `github-actions:${payload.runId}` : null,
        runAttempt: payload.runAttempt ?? 1,
        triggerMethod: 'GITHUB_ACTIONS',
        logMessage: `Queued from GitHub Actions for ${repositoryFullName}@${payload.commit.slice(0, 12)}.`,
      });
      return reply.code(202).send({
        ok: true,
        deploymentId: result.deployment.id,
        status: result.deployment.status,
        reused: result.reused,
      });
    } catch (error) {
      if (error instanceof DeploymentQueueError) {
        request.log.error({ err: error, projectId: project.id }, 'Deployment queue write failed');
        return reply.code(503).send({ message: 'Deployment queue is unavailable. Try the GitHub Actions job again.' });
      }
      throw error;
    }
  });

  app.post('/manual', async (request, reply) => {
    const payload = manualSchema.parse(request.body);
    const project = await prisma.project.findUnique({ where: { id: payload.projectId } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });
    if (!project.repositoryFullName) return reply.code(409).send({ message: 'Connect a GitHub repository before deploying.' });

    try {
      const result = await createQueuedDeployment({
        projectId: project.id,
        branch: project.defaultBranch,
        commit: payload.commit || null,
        externalRunId: `manual:${Date.now()}:${project.id}`,
        runAttempt: 1,
        triggerMethod: project.deploymentMethod,
        logMessage: payload.commit
          ? `Manual deployment queued for ${project.repositoryFullName}@${payload.commit.slice(0, 12)}.`
          : `Manual deployment queued for the latest commit on ${project.defaultBranch}.`,
      });
      return reply.code(202).send({ ok: true, deploymentId: result.deployment.id, status: result.deployment.status });
    } catch (error) {
      if (error instanceof DeploymentQueueError) return reply.code(503).send({ message: 'Deployment queue is unavailable.' });
      throw error;
    }
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
