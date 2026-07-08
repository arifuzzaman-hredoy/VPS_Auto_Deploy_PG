import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { createDomainPlan } from './domain.service.js';

const domainSchema = z.object({
  type: z.enum(['DEFAULT_SUBDOMAIN', 'MAIN_DOMAIN', 'SUBDOMAIN', 'WILDCARD_SUBDOMAIN', 'SAAS_TENANT_WILDCARD']),
  domain: z.string().optional(),
  mainDomain: z.string().optional(),
  subdomain: z.string().optional(),
  wildcardBase: z.string().optional(),
  recordMethod: z.enum(['A', 'CNAME']).default('A'),
  setupMethod: z.enum(['API_AUTO', 'CUSTOM_MANUAL', 'MANAGED_NAMESERVER']).default('API_AUTO')
});

export async function domainRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:projectId/domains/check', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = domainSchema.parse(request.body);
    try {
      const plan = await createDomainPlan({ projectId, ...body });
      return { canAdd: true, plan };
    } catch (error) {
      return reply.code(409).send({ canAdd: false, message: error instanceof Error ? error.message : 'Domain check failed' });
    }
  });

  app.post('/:projectId/domains', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = domainSchema.parse(request.body);
    const plan = await createDomainPlan({ projectId, ...body });
    const routeRecord = plan.records.find((record) => record.purpose === 'ROUTE');
    const txtRecord = plan.records.find((record) => record.purpose === 'OWNERSHIP');
    const domain = await prisma.domain.create({
      data: {
        projectId,
        hostname: plan.hostname,
        type: body.type,
        isWildcard: plan.isWildcard,
        wildcardBase: plan.isWildcard ? plan.hostname.slice(2) : null,
        expectedRecordType: routeRecord?.type,
        expectedRecordName: routeRecord?.name,
        expectedRecordValue: routeRecord?.value,
        verificationTxtName: txtRecord?.name,
        verificationTxtValue: txtRecord?.value,
        status: 'WAITING_FOR_DNS'
      }
    });
    return reply.code(201).send({ domain, records: plan.records });
  });

  app.get('/:projectId/domains', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return prisma.domain.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  });
}
