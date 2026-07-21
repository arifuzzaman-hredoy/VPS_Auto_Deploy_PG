import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getGitHubAppConfiguration,
  listGitHubRepositoryBranches,
} from '../../lib/github-app.js';
import { prisma } from '../../lib/prisma.js';
import { syncGitHubInstallation } from './github.service.js';

const installationParamsSchema = z.object({ installationId: z.string().regex(/^\d+$/) });
const repositoryQuerySchema = z.object({ search: z.string().trim().max(100).optional() });
const branchQuerySchema = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) });

export async function githubRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => {
    const config = getGitHubAppConfiguration();
    const installations = await prisma.gitHubInstallation.count({ where: { status: { not: 'DELETED' } } });
    return { ...config, connectedInstallations: installations };
  });

  app.get('/installations', async () => {
    return prisma.gitHubInstallation.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { accountLogin: 'asc' },
      include: { _count: { select: { repositories: true } } },
    });
  });

  app.post('/installations/sync', async (request, reply) => {
    const body = z.object({ installationId: z.coerce.string().regex(/^\d+$/) }).parse(request.body);
    const config = getGitHubAppConfiguration();
    if (!config.configured) {
      return reply.code(503).send({ message: `GitHub App is not configured. Missing: ${config.missing.join(', ')}` });
    }
    const installation = await syncGitHubInstallation(body.installationId);
    return reply.send(installation);
  });

  app.post('/installations/:installationId/refresh', async (request, reply) => {
    const { installationId } = installationParamsSchema.parse(request.params);
    const installation = await syncGitHubInstallation(installationId);
    return reply.send(installation);
  });

  app.get('/installations/:installationId/repositories', async (request, reply) => {
    const { installationId } = installationParamsSchema.parse(request.params);
    const { search } = repositoryQuerySchema.parse(request.query);
    const installation = await prisma.gitHubInstallation.findUnique({ where: { externalId: installationId } });
    if (!installation) return reply.code(404).send({ message: 'GitHub App installation is not connected.' });

    return prisma.gitHubRepository.findMany({
      where: {
        installationId: installation.id,
        archived: false,
        disabled: false,
        ...(search ? { fullName: { contains: search.toLowerCase(), mode: 'insensitive' } } : {}),
      },
      orderBy: { fullName: 'asc' },
      take: 500,
    });
  });

  app.get('/installations/:installationId/branches', async (request, reply) => {
    const { installationId } = installationParamsSchema.parse(request.params);
    const { repository } = branchQuerySchema.parse(request.query);
    const installation = await prisma.gitHubInstallation.findUnique({ where: { externalId: installationId } });
    if (!installation) return reply.code(404).send({ message: 'GitHub App installation is not connected.' });
    const allowedRepository = await prisma.gitHubRepository.findFirst({
      where: { installationId: installation.id, fullName: repository.toLowerCase() },
    });
    if (!allowedRepository) return reply.code(403).send({ message: 'This GitHub App installation cannot access the repository.' });
    return listGitHubRepositoryBranches(installationId, repository);
  });
}
