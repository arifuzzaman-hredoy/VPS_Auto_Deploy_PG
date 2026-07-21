import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { projectRoutes } from './modules/projects/project.routes.js';
import { deploymentRoutes } from './modules/deployments/deployment.routes.js';
import { domainRoutes } from './modules/domains/domain.routes.js';
import { envRoutes } from './modules/environment/env.routes.js';
import { databaseRoutes } from './modules/database-provisioner/database.routes.js';
import { dnsProviderRoutes } from './modules/dns-providers/dns-provider.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { githubRoutes } from './modules/github/github.routes.js';
import { githubWebhookRoutes } from './modules/github/github-webhook.routes.js';
import { closeDeploymentQueue } from './lib/deployment-queue.js';
import { extractProjectIdFromPath, writeAuditLog } from './lib/audit.js';
import { prisma } from './lib/prisma.js';

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
const mutationMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

await app.register(cors, { origin: true });

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: 'Request validation failed.',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  const httpError = error as { statusCode?: number; message?: string };
  if (typeof httpError.statusCode === 'number' && httpError.statusCode < 500) {
    return reply.code(httpError.statusCode).send({ message: httpError.message || 'Request failed.' });
  }
  request.log.error({ err: error }, 'Unhandled API error');
  return reply.code(500).send({ message: httpError.message || 'Internal server error.' });
});

app.addHook('onResponse', async (request, reply) => {
  if (!mutationMethods.has(request.method)) return;
  const target = request.url.split('?')[0] ?? request.url;
  const projectId = extractProjectIdFromPath(target);
  try {
    await writeAuditLog({
      action: `${request.method} ${request.routeOptions.url ?? target}`,
      target,
      metadata: {
        projectId,
        statusCode: reply.statusCode,
        success: reply.statusCode < 400,
        requestId: request.id,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });
  } catch (auditError) {
    request.log.error({ err: auditError, target }, 'Audit log write failed');
  }
});

await app.register(githubWebhookRoutes, { prefix: '/api/github/webhook' });
await app.register(githubRoutes, { prefix: '/api/github' });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(deploymentRoutes, { prefix: '/api/deployments' });
await app.register(domainRoutes, { prefix: '/api/projects' });
await app.register(envRoutes, { prefix: '/api/projects' });
await app.register(databaseRoutes, { prefix: '/api/projects' });
await app.register(dnsProviderRoutes, { prefix: '/api/dns-providers' });
await app.register(adminRoutes, { prefix: '/api/admin' });

app.get('/api/health', async (_request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'hredoy-deploy-os-api', database: 'connected' };
  } catch {
    return reply.code(503).send({ ok: false, service: 'hredoy-deploy-os-api', database: 'unavailable' });
  }
});


app.addHook('onClose', async () => {
  await closeDeploymentQueue();
  await prisma.$disconnect();
});
const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';
await app.listen({ port, host });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Shutting down API');
  await app.close();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
