import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';

const providerSchema = z.object({
  provider: z.string().min(2),
  providerName: z.string().min(2),
  credential: z.unknown(),
  allowedZone: z.string().optional()
});

export async function dnsProviderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (request, reply) => {
    const body = providerSchema.parse(request.body);
    const user = await prisma.user.upsert({ where: { email: 'owner@techteam.local' }, create: { email: 'owner@techteam.local' }, update: {} });
    const credential = await prisma.dnsProviderCredential.create({
      data: {
        userId: user.id,
        provider: body.provider,
        providerName: body.providerName,
        encryptedCredential: encryptSecret(JSON.stringify(body.credential)),
        allowedZone: body.allowedZone,
        status: 'SAVED'
      }
    });
    return reply.code(201).send({ id: credential.id, provider: credential.provider, providerName: credential.providerName, status: credential.status });
  });

  app.get('/', async () => prisma.dnsProviderCredential.findMany({ select: { id: true, provider: true, providerName: true, allowedZone: true, status: true, createdAt: true } }));

  app.post('/:id/test', async () => ({ ok: true, mode: 'dry-test', message: 'Provider credential test placeholder. Implement adapter-specific verification before production use.' }));

  app.post('/:id/dry-run', async (request) => {
    return { ok: true, dryRun: true, payload: request.body };
  });
}
