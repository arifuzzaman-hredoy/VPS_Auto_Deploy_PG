import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { projectRoutes } from './modules/projects/project.routes.js';
import { deploymentRoutes } from './modules/deployments/deployment.routes.js';
import { domainRoutes } from './modules/domains/domain.routes.js';
import { envRoutes } from './modules/environment/env.routes.js';
import { databaseRoutes } from './modules/database-provisioner/database.routes.js';
import { dnsProviderRoutes } from './modules/dns-providers/dns-provider.routes.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(deploymentRoutes, { prefix: '/api/deployments' });
await app.register(domainRoutes, { prefix: '/api/projects' });
await app.register(envRoutes, { prefix: '/api/projects' });
await app.register(databaseRoutes, { prefix: '/api/projects' });
await app.register(dnsProviderRoutes, { prefix: '/api/dns-providers' });

app.get('/api/health', async () => ({ ok: true, service: 'deploy-os-api' }));

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';
await app.listen({ port, host });
