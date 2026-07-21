import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { normalizeHostname } from '../../lib/validation.js';

const providerSchema = z.object({
  provider: z.enum(['cloudflare']),
  providerName: z.string().trim().min(2).max(100),
  credential: z.object({ apiToken: z.string().trim().min(20) }),
  allowedZone: z.string().trim().min(3),
});

async function verifyCloudflare(apiToken: string): Promise<{ ok: boolean; message: string }> {
  const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; messages?: Array<{ message?: string }> };
  return {
    ok: response.ok && payload.success === true,
    message: payload.messages?.map((item) => item.message).filter(Boolean).join(', ') || (response.ok ? 'Cloudflare token verified.' : `Cloudflare returned HTTP ${response.status}.`),
  };
}

async function findCloudflareZone(apiToken: string, zone: string): Promise<{ id: string; name: string } | null> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zone)}&status=active&per_page=1`, {
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; result?: Array<{ id: string; name: string }> };
  if (!response.ok || payload.success !== true) return null;
  return payload.result?.[0] ?? null;
}

export async function dnsProviderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', async (request, reply) => {
    const body = providerSchema.parse(request.body);
    const user = await prisma.user.upsert({
      where: { email: 'owner@techteam.local' },
      create: { email: 'owner@techteam.local', name: 'Deploy OS Owner' },
      update: {},
    });
    const allowedZone = normalizeHostname(body.allowedZone);
    const verification = await verifyCloudflare(body.credential.apiToken);
    if (!verification.ok) return reply.code(400).send({ message: verification.message });
    const zone = await findCloudflareZone(body.credential.apiToken, allowedZone);
    if (!zone) return reply.code(400).send({ message: `The token cannot access the active Cloudflare zone ${allowedZone}.` });

    const credential = await prisma.dnsProviderCredential.create({
      data: {
        userId: user.id,
        provider: body.provider,
        providerName: body.providerName,
        encryptedCredential: encryptSecret(JSON.stringify(body.credential)),
        allowedZone,
        status: 'ACTIVE',
      },
    });
    return reply.code(201).send({ id: credential.id, provider: credential.provider, providerName: credential.providerName, allowedZone, status: credential.status });
  });

  app.get('/', async () => prisma.dnsProviderCredential.findMany({
    select: { id: true, provider: true, providerName: true, allowedZone: true, status: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  }));

  app.post('/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };
    const credential = await prisma.dnsProviderCredential.findUnique({ where: { id } });
    if (!credential) return reply.code(404).send({ message: 'DNS provider connection not found.' });
    if (credential.provider !== 'cloudflare') return reply.code(400).send({ message: 'Only Cloudflare verification is implemented.' });
    const data = JSON.parse(decryptSecret(credential.encryptedCredential)) as { apiToken?: string };
    if (!data.apiToken) return reply.code(400).send({ message: 'Stored Cloudflare token is invalid.' });
    const verification = await verifyCloudflare(data.apiToken);
    const zone = verification.ok && credential.allowedZone ? await findCloudflareZone(data.apiToken, credential.allowedZone) : null;
    const ok = verification.ok && Boolean(zone);
    await prisma.dnsProviderCredential.update({ where: { id }, data: { status: ok ? 'ACTIVE' : 'FAILED' } });
    return reply.code(ok ? 200 : 400).send({ ok, message: ok ? `Cloudflare connection can access ${zone?.name}.` : verification.message });
  });

  app.post('/:id/dry-run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const credential = await prisma.dnsProviderCredential.findUnique({ where: { id } });
    if (!credential) return reply.code(404).send({ message: 'DNS provider connection not found.' });
    return {
      ok: credential.status === 'ACTIVE',
      dryRun: true,
      provider: credential.provider,
      allowedZone: credential.allowedZone,
      message: 'Connection is ready. Domain-specific record preview is generated from the project Domains page before any write.',
    };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const credential = await prisma.dnsProviderCredential.findUnique({ where: { id } });
    if (!credential) return reply.code(404).send({ message: 'DNS provider connection not found.' });
    await prisma.dnsProviderCredential.delete({ where: { id } });
    return { ok: true, deleted: credential.providerName };
  });
}
