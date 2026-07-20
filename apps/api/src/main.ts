import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { projectRoutes } from './modules/projects/project.routes.js';
import { deploymentRoutes } from './modules/deployments/deployment.routes.js';
import { domainRoutes } from './modules/domains/domain.routes.js';
import { envRoutes } from './modules/environment/env.routes.js';
import { databaseRoutes } from './modules/database-provisioner/database.routes.js';
import { dnsProviderRoutes } from './modules/dns-providers/dns-provider.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { extractProjectIdFromPath, writeAuditLog } from './lib/audit.js';

const app = Fastify({ logger: true });
const mutationMethods = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

await app.register(cors, { origin: true });

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
  } catch (error) {
    request.log.error({ err: error, target }, 'Audit log write failed');
  }
});

await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(deploymentRoutes, { prefix: '/api/deployments' });
await app.register(domainRoutes, { prefix: '/api/projects' });
await app.register(envRoutes, { prefix: '/api/projects' });
await app.register(databaseRoutes, { prefix: '/api/projects' });
await app.register(dnsProviderRoutes, { prefix: '/api/dns-providers' });
await app.register(adminRoutes, { prefix: '/api/admin' });

app.get('/api/health', async () => ({ ok: true, service: 'deploy-os-api' }));

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';
await app.listen({ port, host });
