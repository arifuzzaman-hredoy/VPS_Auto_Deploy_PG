import { resolve4, resolveCname, resolveTxt } from 'node:dns/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { decryptSecret } from '../../lib/crypto.js';
import { createDomainPlan } from './domain.service.js';

const domainSchema = z.object({
  type: z.enum(['DEFAULT_SUBDOMAIN', 'MAIN_DOMAIN', 'SUBDOMAIN', 'WILDCARD_SUBDOMAIN', 'SAAS_TENANT_WILDCARD']),
  domain: z.string().optional(),
  mainDomain: z.string().optional(),
  subdomain: z.string().optional(),
  wildcardBase: z.string().optional(),
  recordMethod: z.enum(['A', 'CNAME']).default('A'),
  setupMethod: z.enum(['API_AUTO', 'CUSTOM_MANUAL', 'MANAGED_NAMESERVER']).default('CUSTOM_MANUAL'),
  isPrimary: z.boolean().default(false),
});


type CloudflareResponse<T> = { success?: boolean; errors?: Array<{ message?: string }>; result?: T };

async function cloudflareRequest<T>(apiToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as CloudflareResponse<T>;
  if (!response.ok || payload.success !== true) {
    const message = payload.errors?.map((item) => item.message).filter(Boolean).join(', ');
    throw new Error(message || `Cloudflare returned HTTP ${response.status}.`);
  }
  return payload.result as T;
}

async function applyCloudflareRecord(
  apiToken: string,
  zoneId: string,
  record: { type: string; name: string; value: string; ttl: number },
): Promise<{ id: string }> {
  const existing = await cloudflareRequest<Array<{ id: string }>>(
    apiToken,
    `/zones/${zoneId}/dns_records?type=${encodeURIComponent(record.type)}&name=${encodeURIComponent(record.name)}&per_page=1`,
  );
  const body = JSON.stringify({
    type: record.type,
    name: record.name,
    content: record.value,
    ttl: Math.max(60, record.ttl),
    proxied: false,
  });
  const current = existing[0];
  return current
    ? cloudflareRequest<{ id: string }>(apiToken, `/zones/${zoneId}/dns_records/${current.id}`, { method: 'PUT', body })
    : cloudflareRequest<{ id: string }>(apiToken, `/zones/${zoneId}/dns_records`, { method: 'POST', body });
}

async function routeRecordMatches(domain: {
  hostname: string;
  expectedRecordType: string | null;
  expectedRecordValue: string | null;
}): Promise<boolean> {
  const host = domain.hostname.replace(/^\*\./, '');
  try {
    if (domain.expectedRecordType === 'A') {
      const values = await resolve4(host);
      return Boolean(domain.expectedRecordValue && values.includes(domain.expectedRecordValue));
    }
    if (domain.expectedRecordType === 'CNAME') {
      const values = await resolveCname(host);
      const expected = domain.expectedRecordValue?.replace(/\.$/, '').toLowerCase();
      return values.some((value) => value.replace(/\.$/, '').toLowerCase() === expected);
    }
  } catch {
    return false;
  }
  return false;
}

async function ownershipMatches(name: string | null, expected: string | null): Promise<boolean> {
  if (!name || !expected) return false;
  try {
    const values = await resolveTxt(name);
    return values.some((segments) => segments.join('') === expected);
  } catch {
    return false;
  }
}

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
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });
    const body = domainSchema.parse(request.body);
    const plan = await createDomainPlan({ projectId, ...body });
    const routeRecord = plan.records.find((record) => record.purpose === 'ROUTE');
    const txtRecord = plan.records.find((record) => record.purpose === 'OWNERSHIP');

    const domain = await prisma.$transaction(async (tx: any) => {
      if (body.isPrimary) await tx.domain.updateMany({ where: { projectId }, data: { isPrimary: false } });
      return tx.domain.upsert({
        where: { hostname: plan.hostname },
        update: {
          type: body.type,
          isPrimary: body.isPrimary,
          expectedRecordType: routeRecord?.type,
          expectedRecordName: routeRecord?.name,
          expectedRecordValue: routeRecord?.value,
          verificationTxtName: txtRecord?.name,
          verificationTxtValue: txtRecord?.value,
          errorMessage: null,
        },
        create: {
          projectId,
          hostname: plan.hostname,
          type: body.type,
          isPrimary: body.isPrimary,
          isWildcard: plan.isWildcard,
          wildcardBase: plan.isWildcard ? plan.hostname.slice(2) : null,
          expectedRecordType: routeRecord?.type,
          expectedRecordName: routeRecord?.name,
          expectedRecordValue: routeRecord?.value,
          verificationTxtName: txtRecord?.name,
          verificationTxtValue: txtRecord?.value,
          status: 'WAITING_FOR_DNS',
        },
      });
    });
    return reply.code(201).send({ domain, records: plan.records });
  });

  app.post('/:projectId/domains/:domainId/apply-dns', async (request, reply) => {
    const { projectId, domainId } = request.params as { projectId: string; domainId: string };
    const domain = await prisma.domain.findFirst({ where: { id: domainId, projectId } });
    if (!domain) return reply.code(404).send({ message: 'Domain not found.' });

    const hostname = domain.hostname.replace(/^\*\./, '');
    const credentials = await prisma.dnsProviderCredential.findMany({
      where: { provider: 'cloudflare', status: 'ACTIVE', allowedZone: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    const credential = credentials
      .filter((item: any) => hostname === item.allowedZone || hostname.endsWith(`.${item.allowedZone}`))
      .sort((left: any, right: any) => String(right.allowedZone).length - String(left.allowedZone).length)[0];
    if (!credential?.allowedZone) {
      return reply.code(409).send({ message: 'No active Cloudflare connection covers this domain. Add one in DNS Providers or create the records manually.' });
    }

    const stored = JSON.parse(decryptSecret(credential.encryptedCredential)) as { apiToken?: string };
    if (!stored.apiToken) return reply.code(500).send({ message: 'Stored Cloudflare token is invalid.' });

    const zones = await cloudflareRequest<Array<{ id: string; name: string }>>(
      stored.apiToken,
      `/zones?name=${encodeURIComponent(credential.allowedZone)}&status=active&per_page=1`,
    );
    const zone = zones[0];
    if (!zone) return reply.code(409).send({ message: `Cloudflare zone ${credential.allowedZone} is not available to this token.` });

    const records = [
      domain.expectedRecordType && domain.expectedRecordName && domain.expectedRecordValue
        ? { type: domain.expectedRecordType, name: domain.expectedRecordName, value: domain.expectedRecordValue, ttl: 300 }
        : null,
      domain.verificationTxtName && domain.verificationTxtValue
        ? { type: 'TXT', name: domain.verificationTxtName, value: domain.verificationTxtValue, ttl: 300 }
        : null,
    ].filter((record): record is { type: string; name: string; value: string; ttl: number } => Boolean(record));

    if (records.length !== 2) return reply.code(409).send({ message: 'Domain DNS plan is incomplete. Save the domain again.' });
    for (const record of records) await applyCloudflareRecord(stored.apiToken, zone.id, record);

    await prisma.domain.update({
      where: { id: domain.id },
      data: { status: 'DNS_APPLIED', dnsStatus: 'PENDING', ownershipStatus: 'PENDING', errorMessage: null, lastCheckedAt: null },
    });
    return { ok: true, provider: credential.providerName, zone: zone.name, records: records.length };
  });

  app.post('/:projectId/domains/:domainId/verify', async (request, reply) => {
    const { projectId, domainId } = request.params as { projectId: string; domainId: string };
    const domain = await prisma.domain.findFirst({ where: { id: domainId, projectId } });
    if (!domain) return reply.code(404).send({ message: 'Domain not found.' });

    const [dnsPointed, ownershipVerified] = await Promise.all([
      routeRecordMatches(domain),
      ownershipMatches(domain.verificationTxtName, domain.verificationTxtValue),
    ]);
    const ready = dnsPointed && ownershipVerified;
    const updated = await prisma.domain.update({
      where: { id: domain.id },
      data: {
        dnsStatus: dnsPointed ? 'POINTED' : 'NOT_POINTED',
        ownershipStatus: ownershipVerified ? 'VERIFIED' : 'FAILED',
        status: ready ? 'READY_FOR_DEPLOY' : 'DNS_CHECK_FAILED',
        lastCheckedAt: new Date(),
        verifiedAt: ownershipVerified ? new Date() : null,
        errorMessage: ready ? null : 'DNS route and ownership TXT record must both resolve.',
      },
    });
    return { ok: ready, domain: updated };
  });

  app.patch('/:projectId/domains/:domainId/primary', async (request, reply) => {
    const { projectId, domainId } = request.params as { projectId: string; domainId: string };
    const domain = await prisma.domain.findFirst({ where: { id: domainId, projectId } });
    if (!domain) return reply.code(404).send({ message: 'Domain not found.' });
    await prisma.$transaction([
      prisma.domain.updateMany({ where: { projectId }, data: { isPrimary: false } }),
      prisma.domain.update({ where: { id: domainId }, data: { isPrimary: true } }),
      prisma.project.update({ where: { id: projectId }, data: { primaryDomain: domain.hostname.replace(/^\*\./, '') } }),
    ]);
    return { ok: true };
  });

  app.delete('/:projectId/domains/:domainId', async (request, reply) => {
    const { projectId, domainId } = request.params as { projectId: string; domainId: string };
    const domain = await prisma.domain.findFirst({ where: { id: domainId, projectId } });
    if (!domain) return reply.code(404).send({ message: 'Domain not found.' });
    await prisma.domain.delete({ where: { id: domainId } });
    return { ok: true, deleted: domain.hostname };
  });

  app.get('/:projectId/domains', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });
    return prisma.domain.findMany({ where: { projectId }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }] });
  });
}
