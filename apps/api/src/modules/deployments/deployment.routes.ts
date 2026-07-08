import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const triggerSchema = z.object({
  repository: z.string().min(3),
  branch: z.string().min(1),
  commit: z.string().min(6),
  runId: z.string().optional()
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
  app.post('/trigger', async (request, reply) => {
    const auth = request.headers.authorization;
    const token = auth?.replace(/^Bearer\s+/i, '');
    if (!token) return reply.code(401).send({ message: 'Missing DEPLOY_TOKEN' });

    const payload = triggerSchema.parse(request.body);
    const project = await prisma.project.findFirst({ where: { repoUrl: { contains: payload.repository } } });
    if (!project) return reply.code(404).send({ message: 'Project not found for repository' });

    // MVP: token validation placeholder. Production should hash/store per project tokens.
    if (token.length < 20) return reply.code(401).send({ message: 'Invalid deploy token' });

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        source: 'GITHUB',
        branch: payload.branch,
        commitSha: payload.commit,
        status: 'QUEUED'
      }
    });

    await deploymentQueue.add('deploy', { deploymentId: deployment.id, projectId: project.id, commit: payload.commit });
    return reply.code(202).send({ ok: true, deploymentId: deployment.id, status: 'QUEUED' });
  });

  app.get('/:deploymentId/logs', async (request) => {
    const { deploymentId } = request.params as { deploymentId: string };
    return prisma.deploymentLog.findMany({ where: { deploymentId }, orderBy: { createdAt: 'asc' } });
  });
}
