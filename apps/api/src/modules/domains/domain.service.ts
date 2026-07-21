import type { DnsRecordPlan, DomainType } from '@techteam/shared';
import { prisma } from '../../lib/prisma.js';
import { isValidHostname, normalizeHostname } from '../../lib/validation.js';

const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'vps.techteamlead.com']);

export interface DomainPlanInput {
  projectId: string;
  type: DomainType;
  domain?: string;
  mainDomain?: string;
  subdomain?: string;
  wildcardBase?: string;
  recordMethod: 'A' | 'CNAME';
}

export interface DomainPlanResult {
  hostname: string;
  isWildcard: boolean;
  records: DnsRecordPlan[];
}

function safeLabel(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new Error(`${label} must be a valid DNS label.`);
  }
  return normalized;
}

export async function createDomainPlan(input: DomainPlanInput): Promise<DomainPlanResult> {
  const vpsIp = process.env.DEPLOY_OS_VPS_IP;
  const cnameTarget = process.env.DEPLOY_OS_CNAME_TARGET;
  if (input.recordMethod === 'A' && !vpsIp) throw new Error('DEPLOY_OS_VPS_IP is not configured.');
  if (input.recordMethod === 'CNAME' && !cnameTarget) throw new Error('DEPLOY_OS_CNAME_TARGET is not configured.');

  let hostname = '';
  let isWildcard = false;

  if (input.type === 'MAIN_DOMAIN' || input.type === 'DEFAULT_SUBDOMAIN') {
    hostname = normalizeHostname(input.domain ?? '');
  } else if (input.type === 'SUBDOMAIN') {
    const main = normalizeHostname(input.mainDomain ?? '');
    const sub = safeLabel(input.subdomain ?? '', 'Subdomain');
    hostname = `${sub}.${main}`;
  } else {
    const main = normalizeHostname(input.mainDomain ?? '');
    const base = safeLabel(input.wildcardBase ?? '', 'Wildcard base');
    hostname = `*.${base}.${main}`;
    isWildcard = true;
  }

  if (!isValidHostname(hostname)) throw new Error('Invalid domain format.');
  if (blockedHosts.has(hostname.replace(/^\*\./, ''))) throw new Error('This domain is reserved.');
  await assertNoDomainConflict(hostname, input.projectId, isWildcard);

  const routeRecord: DnsRecordPlan = {
    type: input.recordMethod,
    name: hostname,
    value: input.recordMethod === 'A' ? String(vpsIp) : String(cnameTarget),
    ttl: 300,
    purpose: 'ROUTE',
  };
  const ownershipRecord: DnsRecordPlan = {
    type: 'TXT',
    name: `_hredoy-deploy.${hostname.replace(/^\*\./, '')}`,
    value: `hredoy-deploy-verify=${input.projectId}`,
    ttl: 300,
    purpose: 'OWNERSHIP',
  };
  return { hostname, isWildcard, records: [routeRecord, ownershipRecord] };
}

async function assertNoDomainConflict(hostname: string, projectId: string, isWildcard: boolean): Promise<void> {
  const exact = await prisma.domain.findUnique({ where: { hostname } });
  if (exact && exact.projectId !== projectId) throw new Error('This domain is already assigned to another project.');
  const domains = await prisma.domain.findMany({ where: { projectId: { not: projectId } } });

  if (isWildcard) {
    const scope = hostname.slice(2);
    const conflict = domains.find((domain: any) =>
      domain.hostname === scope ||
      domain.hostname.endsWith(`.${scope}`) ||
      (domain.isWildcard && overlapsWildcard(hostname, domain.hostname)),
    );
    if (conflict) throw new Error('Wildcard collision detected with another project.');
    return;
  }

  const wildcardConflict = domains.find((domain: any) => domain.isWildcard && hostname.endsWith(`.${domain.hostname.slice(2)}`));
  if (wildcardConflict) throw new Error('This hostname is covered by another project wildcard.');
}

function overlapsWildcard(a: string, b: string): boolean {
  const left = a.replace(/^\*\./, '');
  const right = b.replace(/^\*\./, '');
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}
