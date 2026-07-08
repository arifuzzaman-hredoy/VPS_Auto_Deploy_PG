import type { DnsRecordPlan, DomainType } from '@techteam/shared';
import { prisma } from '../../lib/prisma.js';
import { isValidHostname, normalizeHostname } from '../../lib/validation.js';

const blockedHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'admin.deploy.techteamlead.com',
  'api.deploy.techteamlead.com',
  'runner.deploy.techteamlead.com'
]);

export interface DomainPlanInput {
  projectId: string;
  type: DomainType;
  domain?: string;
  mainDomain?: string;
  subdomain?: string;
  wildcardBase?: string;
  recordMethod: 'A' | 'CNAME';
  includeBaseDomain?: boolean;
}

export interface DomainPlanResult {
  hostname: string;
  isWildcard: boolean;
  records: DnsRecordPlan[];
}

export async function createDomainPlan(input: DomainPlanInput): Promise<DomainPlanResult> {
  const vpsIp = process.env.DEPLOY_OS_VPS_IP ?? '198.54.121.88';
  const cnameTarget = process.env.DEPLOY_OS_CNAME_TARGET ?? 'cname.deploy.techteamlead.com';
  const token = `deployos-verify=${input.projectId}`;

  let hostname: string;
  let recordName: string;
  let verificationName: string;
  let isWildcard = false;

  if (input.type === 'MAIN_DOMAIN') {
    hostname = normalizeHostname(input.domain ?? '');
    recordName = '@';
    verificationName = '_deployos';
  } else if (input.type === 'SUBDOMAIN') {
    const main = normalizeHostname(input.mainDomain ?? '');
    const sub = normalizeHostname(input.subdomain ?? '').replace(/\..*$/, '');
    hostname = `${sub}.${main}`;
    recordName = sub;
    verificationName = `_deployos.${sub}`;
  } else if (input.type === 'WILDCARD_SUBDOMAIN' || input.type === 'SAAS_TENANT_WILDCARD') {
    const main = normalizeHostname(input.mainDomain ?? '');
    const base = normalizeHostname(input.wildcardBase ?? '').replace(/\..*$/, '');
    hostname = `*.${base}.${main}`;
    recordName = `*.${base}`;
    verificationName = `_deployos.${base}`;
    isWildcard = true;
  } else {
    hostname = normalizeHostname(input.domain ?? '');
    recordName = hostname.split('.')[0] ?? '@';
    verificationName = `_deployos.${recordName}`;
  }

  if (!isValidHostname(hostname)) throw new Error('Invalid domain format.');
  if (blockedHosts.has(hostname)) throw new Error('This domain is reserved.');

  await assertNoDomainConflict(hostname, input.projectId, isWildcard);

  const routeRecord: DnsRecordPlan = {
    type: input.recordMethod,
    name: recordName,
    value: input.recordMethod === 'A' ? vpsIp : cnameTarget,
    ttl: 300,
    purpose: 'ROUTE'
  };

  const ownershipRecord: DnsRecordPlan = {
    type: 'TXT',
    name: verificationName,
    value: token,
    ttl: 300,
    purpose: 'OWNERSHIP'
  };

  return { hostname, isWildcard, records: [routeRecord, ownershipRecord] };
}

async function assertNoDomainConflict(hostname: string, projectId: string, isWildcard: boolean): Promise<void> {
  const exact = await prisma.domain.findUnique({ where: { hostname } });
  if (exact && exact.projectId !== projectId) throw new Error('This domain/subdomain is already assigned to another project.');

  const domains = await prisma.domain.findMany({ where: { projectId: { not: projectId } } });

  if (isWildcard) {
    const scope = hostname.slice(2);
    const conflict = domains.find((domain: (typeof domains)[number]) => domain.hostname.endsWith(`.${scope}`) || domain.hostname === scope || (domain.isWildcard && overlapsWildcard(hostname, domain.hostname)));
    if (conflict) throw new Error('Wildcard collision detected with another project.');
    return;
  }

  const wildcardConflict = domains.find((domain: (typeof domains)[number]) => domain.isWildcard && hostname.endsWith(`.${domain.hostname.slice(2)}`));
  if (wildcardConflict) throw new Error('This hostname is covered by an existing wildcard domain assigned to another project.');
}

function overlapsWildcard(a: string, b: string): boolean {
  const as = a.replace(/^\*\./, '');
  const bs = b.replace(/^\*\./, '');
  return as === bs || as.endsWith(`.${bs}`) || bs.endsWith(`.${as}`);
}
