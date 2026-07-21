import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { encryptSecret } from '../../lib/crypto.js';
import {
  buildGitHubAppManifest,
  convertGitHubAppManifest,
  createGitHubManifestState,
  getGitHubAppConfiguration,
  listGitHubRepositoryBranches,
  verifyGitHubManifestState,
} from '../../lib/github-app.js';
import { prisma } from '../../lib/prisma.js';
import { syncGitHubInstallation } from './github.service.js';

const installationParamsSchema = z.object({ installationId: z.string().regex(/^\d+$/) });
const repositoryQuerySchema = z.object({ search: z.string().trim().max(100).optional() });
const branchQuerySchema = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/) });
const manifestCompleteSchema = z.object({
  code: z.string().trim().min(20).max(200),
  state: z.string().trim().min(20).max(1000),
});

export async function githubRoutes(app: FastifyInstance): Promise<void> {
  app.get('/status', async () => {
    const config = await getGitHubAppConfiguration();
    const installations = await prisma.gitHubInstallation.count({ where: { status: { not: 'DELETED' } } });
    return { ...config, connectedInstallations: installations };
  });

  app.get('/connect-flow', async () => {
    const config = await getGitHubAppConfiguration();
    if (config.configured && config.installUrl) {
      return {
        type: 'install',
        actionUrl: config.installUrl,
        message: 'GitHub App is ready. Choose an account or organization and grant access to all or selected repositories.',
      };
    }

    return {
      type: 'manifest',
      actionUrl: 'https://github.com/settings/apps/new',
      manifest: JSON.stringify(buildGitHubAppManifest()),
      state: createGitHubManifestState(),
      message: 'The first connection creates the private GitHub App automatically, then continues to repository access.',
    };
  });

  app.post('/manifest/complete', async (request, reply) => {
    const body = manifestCompleteSchema.parse(request.body);
    if (!verifyGitHubManifestState(body.state)) {
      return reply.code(400).send({ message: 'GitHub connection state expired or is invalid. Start Connect GitHub again.' });
    }

    const current = await getGitHubAppConfiguration();
    if (current.configured) {
      return reply.code(409).send({ message: 'A GitHub App is already configured on this Deploy OS server.', installUrl: current.installUrl });
    }

    const converted = await convertGitHubAppManifest(body.code);
    if (!converted.id || !converted.slug || !converted.pem || !converted.webhook_secret) {
      return reply.code(502).send({ message: 'GitHub returned an incomplete App configuration.' });
    }

    await prisma.gitHubAppConfiguration.upsert({
      where: { id: 'primary' },
      create: {
        id: 'primary',
        appId: String(converted.id),
        appSlug: converted.slug,
        clientId: converted.client_id || null,
        encryptedClientSecret: converted.client_secret ? encryptSecret(converted.client_secret) : null,
        encryptedPrivateKey: encryptSecret(converted.pem),
        encryptedWebhookSecret: encryptSecret(converted.webhook_secret),
        ownerLogin: converted.owner?.login || null,
        htmlUrl: converted.html_url || `https://github.com/apps/${converted.slug}`,
      },
      update: {
        appId: String(converted.id),
        appSlug: converted.slug,
        clientId: converted.client_id || null,
        encryptedClientSecret: converted.client_secret ? encryptSecret(converted.client_secret) : null,
        encryptedPrivateKey: encryptSecret(converted.pem),
        encryptedWebhookSecret: encryptSecret(converted.webhook_secret),
        ownerLogin: converted.owner?.login || null,
        htmlUrl: converted.html_url || `https://github.com/apps/${converted.slug}`,
      },
    });

    return reply.send({
      configured: true,
      appSlug: converted.slug,
      installUrl: `https://github.com/apps/${encodeURIComponent(converted.slug)}/installations/new`,
      message: 'GitHub App created securely. Continue to choose the account and repositories it may access.',
    });
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
    const config = await getGitHubAppConfiguration();
    if (!config.configured) {
      return reply.code(503).send({ message: 'GitHub App is not configured. Start with Connect GitHub.' });
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
