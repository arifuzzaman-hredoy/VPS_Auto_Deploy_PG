import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Client } from 'pg';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { assertSafeDatabaseIdentifier } from '../../lib/validation.js';

const entityKeys = [
  'projects',
  'users',
  'deployKeys',
  'workflowFiles',
  'environmentVariables',
  'projectDatabases',
  'deployments',
  'deploymentLogs',
  'domains',
  'dnsProviders',
  'auditLogs',
] as const;

type EntityKey = (typeof entityKeys)[number];

type DisplayField = {
  label: string;
  value: string;
};

type DatabaseRecord = {
  id: string;
  entity: EntityKey;
  title: string;
  subtitle: string;
  projectId?: string | null;
  projectName?: string | null;
  status?: string | null;
  createdAt?: string | null;
  fields: DisplayField[];
};

const entitySchema = z.enum(entityKeys);
const listQuerySchema = z.object({
  entity: entitySchema.default('projects'),
  projectId: z.string().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

const logQuerySchema = z.object({
  type: z.enum(['all', 'activity', 'deployments', 'errors', 'data']).default('all'),
  projectId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(30),
});

const deleteBodySchema = z.object({
  confirmation: z.literal('DELETE'),
  dropPhysicalDatabase: z.boolean().default(false),
});

const categories = [
  {
    key: 'projects',
    label: 'Projects',
    description: 'Projects and ownership records',
    entities: ['projects', 'users'] as EntityKey[],
  },
  {
    key: 'deployments',
    label: 'Deployments',
    description: 'Deployment runs and their logs',
    entities: ['deployments', 'deploymentLogs'] as EntityKey[],
  },
  {
    key: 'configuration',
    label: 'Configuration',
    description: 'Deploy keys, workflows and environment variables',
    entities: ['deployKeys', 'workflowFiles', 'environmentVariables'] as EntityKey[],
  },
  {
    key: 'infrastructure',
    label: 'Infrastructure',
    description: 'Databases, domains and DNS provider records',
    entities: ['projectDatabases', 'domains', 'dnsProviders'] as EntityKey[],
  },
  {
    key: 'system',
    label: 'System',
    description: 'Audit trail and system actions',
    entities: ['auditLogs'] as EntityKey[],
  },
];

const entityLabels: Record<EntityKey, string> = {
  projects: 'Projects',
  users: 'Users',
  deployKeys: 'Deploy keys',
  workflowFiles: 'Workflow files',
  environmentVariables: 'Environment variables',
  projectDatabases: 'Project databases',
  deployments: 'Deployments',
  deploymentLogs: 'Deployment logs',
  domains: 'Domains',
  dnsProviders: 'DNS providers',
  auditLogs: 'Audit logs',
};

function valuesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readAdminToken(request: FastifyRequest): string {
  const header = request.headers['x-deploy-os-admin-token'];
  if (Array.isArray(header)) return header[0] ?? '';
  return typeof header === 'string' ? header : '';
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function field(label: string, value: unknown): DisplayField {
  return { label, value: stringValue(value) };
}

function normalizeSearch(record: DatabaseRecord): string {
  return [
    record.title,
    record.subtitle,
    record.projectName,
    record.status,
    ...record.fields.flatMap((item) => [item.label, item.value]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function projectReference(project: { id: string; name: string } | null | undefined) {
  return {
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
  };
}

async function loadRecords(entity: EntityKey): Promise<DatabaseRecord[]> {
  switch (entity) {
    case 'projects': {
      const rows = await prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { email: true } },
          _count: {
            select: {
              deployKeys: true,
              workflowFiles: true,
              envVars: true,
              databases: true,
              deployments: true,
              domains: true,
            },
          },
        },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.name,
        subtitle: row.slug,
        projectId: row.id,
        projectName: row.name,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Repository', row.repoUrl),
          field('Branch', row.defaultBranch),
          field('Framework', row.framework),
          field('Live URL', row.liveUrl),
          field('Owner', row.owner.email),
          field('Deploy keys', row._count.deployKeys),
          field('Environment keys', row._count.envVars),
          field('Databases', row._count.databases),
          field('Deployments', row._count.deployments),
          field('Domains', row._count.domains),
        ],
      }));
    }
    case 'users': {
      const rows = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { projects: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.name || row.email,
        subtitle: row.email,
        status: row._count.projects > 0 ? 'Has projects' : 'No projects',
        createdAt: row.createdAt.toISOString(),
        fields: [field('Email', row.email), field('Projects', row._count.projects), field('Updated', row.updatedAt)],
      }));
    }
    case 'deployKeys': {
      const rows = await prisma.deployKey.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true, slug: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.fingerprint,
        subtitle: row.publicKey.slice(0, 64) + (row.publicKey.length > 64 ? '…' : ''),
        ...projectReference(row.project),
        status: row.isActive ? 'Active' : 'Inactive',
        createdAt: row.createdAt.toISOString(),
        fields: [field('Project slug', row.project.slug), field('Public key', row.publicKey), field('Private key', 'Encrypted and hidden')],
      }));
    }
    case 'workflowFiles': {
      const rows = await prisma.workflowFile.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.name,
        subtitle: row.path,
        ...projectReference(row.project),
        status: row.isValid ? 'Valid' : 'Needs review',
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Branches', row.triggerBranches.join(', ')),
          field('Uses Deploy OS API', row.usesDeployOsApi),
          field('Warnings', row.warnings.join(', ')),
        ],
      }));
    }
    case 'environmentVariables': {
      const rows = await prisma.environmentVariable.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.key,
        subtitle: row.environment,
        ...projectReference(row.project),
        status: row.isSystemManaged ? 'System managed' : row.isSecret ? 'Secret' : 'Public',
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Environment', row.environment),
          field('Secret', row.isSecret),
          field('System managed', row.isSystemManaged),
          field('Value', row.isSecret ? 'Encrypted and hidden' : row.encryptedValue),
          field('Updated', row.updatedAt),
        ],
      }));
    }
    case 'projectDatabases': {
      const rows = await prisma.projectDatabase.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.databaseName,
        subtitle: `${row.username}@${row.host}:${row.port}`,
        ...projectReference(row.project),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Type', row.type),
          field('Host', row.host),
          field('Port', row.port),
          field('Username', row.username),
          field('Migration mode', row.migrationMode),
          field('Password', 'Encrypted and hidden'),
          field('Database URL', 'Encrypted and hidden'),
        ],
      }));
    }
    case 'deployments': {
      const rows = await prisma.deployment.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true } },
          _count: { select: { logs: true } },
        },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: `${row.branch}${row.commitSha ? ` · ${row.commitSha.slice(0, 8)}` : ''}`,
        subtitle: row.id,
        ...projectReference(row.project),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Source', row.source),
          field('Commit', row.commitSha),
          field('Image tag', row.imageTag),
          field('Container', row.containerName),
          field('Started', row.startedAt),
          field('Finished', row.finishedAt),
          field('Live at', row.liveAt),
          field('Log entries', row._count.logs),
        ],
      }));
    }
    case 'deploymentLogs': {
      const rows = await prisma.deploymentLog.findMany({
        orderBy: { createdAt: 'desc' },
        include: { deployment: { include: { project: { select: { id: true, name: true } } } } },
        take: 3000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.message,
        subtitle: `Deployment ${row.deploymentId}`,
        ...projectReference(row.deployment.project),
        status: row.level,
        createdAt: row.createdAt.toISOString(),
        fields: [field('Level', row.level), field('Deployment status', row.deployment.status), field('Branch', row.deployment.branch)],
      }));
    }
    case 'domains': {
      const rows = await prisma.domain.findMany({
        orderBy: { createdAt: 'desc' },
        include: { project: { select: { id: true, name: true } } },
        take: 2000,
      });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.hostname,
        subtitle: row.type,
        ...projectReference(row.project),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        fields: [
          field('Primary', row.isPrimary),
          field('Wildcard', row.isWildcard),
          field('DNS status', row.dnsStatus),
          field('Ownership', row.ownershipStatus),
          field('SSL status', row.sslStatus),
          field('Route status', row.routeStatus),
          field('Expected record', `${row.expectedRecordType ?? ''} ${row.expectedRecordName ?? ''} ${row.expectedRecordValue ?? ''}`.trim()),
          field('Error', row.errorMessage),
          field('Last checked', row.lastCheckedAt),
        ],
      }));
    }
    case 'dnsProviders': {
      const rows = await prisma.dnsProviderCredential.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.providerName,
        subtitle: row.provider,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        fields: [field('Allowed zone', row.allowedZone), field('Credential', 'Encrypted and hidden'), field('Updated', row.updatedAt)],
      }));
    }
    case 'auditLogs': {
      const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 3000 });
      return rows.map((row: any) => ({
        id: row.id,
        entity,
        title: row.action,
        subtitle: row.target,
        status: 'Recorded',
        createdAt: row.createdAt.toISOString(),
        fields: [field('Actor', row.actorId), field('Metadata', row.metadata)],
      }));
    }
  }
}

function categoryFromTarget(target: string, action: string): string {
  const value = `${target} ${action}`.toLowerCase();
  if (value.includes('/database') || value.includes('database')) return 'Database';
  if (value.includes('/env') || value.includes('environment')) return 'Environment';
  if (value.includes('/domains') || value.includes('domain')) return 'Domains';
  if (value.includes('dns-provider') || value.includes('/dns')) return 'DNS';
  if (value.includes('/deployments') || value.includes('deployment')) return 'Deployments';
  if (value.includes('/projects') || value.includes('project')) return 'Projects';
  if (value.includes('/admin/database')) return 'Data management';
  return 'System';
}

function projectIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).projectId;
  return typeof value === 'string' ? value : null;
}

async function quoteIdentifier(client: Client, value: string): Promise<string> {
  const result = await client.query<{ quoted: string }>('SELECT quote_ident($1::text) AS quoted', [value]);
  const quoted = result.rows[0]?.quoted;
  if (!quoted) throw new Error('PostgreSQL could not quote the identifier.');
  return quoted;
}

async function dropPhysicalDatabase(databaseName: string, username: string): Promise<void> {
  const protectedNames = new Set(['postgres', 'template0', 'template1', 'deploy_os', 'deploy_os_password']);
  if (protectedNames.has(databaseName) || protectedNames.has(username)) {
    throw new Error('This database or role is protected and cannot be removed from Deploy OS.');
  }

  assertSafeDatabaseIdentifier(databaseName, 'Database name');
  assertSafeDatabaseIdentifier(username, 'Database username');

  const adminUrl = process.env.POSTGRES_ADMIN_URL;
  if (!adminUrl) throw new Error('POSTGRES_ADMIN_URL is missing on the Deploy OS server.');

  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const quotedDatabase = await quoteIdentifier(client, databaseName);
    const quotedRole = await quoteIdentifier(client, username);
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`);
    await client.query(`DROP ROLE IF EXISTS ${quotedRole}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function deleteRecord(entity: EntityKey, id: string, dropPhysical: boolean): Promise<{ deleted: string; note?: string }> {
  switch (entity) {
    case 'projects': {
      const project = await prisma.project.findUnique({
        where: { id },
        include: { databases: true },
      });
      if (!project) throw new Error('Project not found.');
      if (dropPhysical) {
        for (const database of project.databases) {
          await dropPhysicalDatabase(database.databaseName, database.username);
        }
      }
      await prisma.project.delete({ where: { id } });
      return { deleted: project.name, note: dropPhysical ? 'Project and tracked physical databases removed.' : 'Project control data removed. Physical databases were kept.' };
    }
    case 'users': {
      const user = await prisma.user.findUnique({ where: { id }, include: { projects: { include: { databases: true } } } });
      if (!user) throw new Error('User not found.');
      if (dropPhysical) {
        for (const project of user.projects) {
          for (const database of project.databases) {
            await dropPhysicalDatabase(database.databaseName, database.username);
          }
        }
      }
      await prisma.$transaction([
        prisma.dnsProviderCredential.deleteMany({ where: { userId: id } }),
        prisma.project.deleteMany({ where: { ownerId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);
      return { deleted: user.email, note: 'User and owned project control data removed.' };
    }
    case 'deployKeys': {
      const row = await prisma.deployKey.delete({ where: { id } });
      return { deleted: row.fingerprint };
    }
    case 'workflowFiles': {
      const row = await prisma.workflowFile.delete({ where: { id } });
      return { deleted: row.path };
    }
    case 'environmentVariables': {
      const row = await prisma.environmentVariable.delete({ where: { id } });
      return { deleted: row.key };
    }
    case 'projectDatabases': {
      const row = await prisma.projectDatabase.findUnique({ where: { id } });
      if (!row) throw new Error('Database record not found.');
      if (dropPhysical) await dropPhysicalDatabase(row.databaseName, row.username);
      await prisma.projectDatabase.delete({ where: { id } });
      return { deleted: row.databaseName, note: dropPhysical ? 'Control record, physical database and role removed.' : 'Control record removed. Physical database and role were kept.' };
    }
    case 'deployments': {
      const row = await prisma.deployment.delete({ where: { id } });
      return { deleted: row.id };
    }
    case 'deploymentLogs': {
      const row = await prisma.deploymentLog.delete({ where: { id } });
      return { deleted: row.id };
    }
    case 'domains': {
      const row = await prisma.domain.delete({ where: { id } });
      return { deleted: row.hostname };
    }
    case 'dnsProviders': {
      const row = await prisma.dnsProviderCredential.delete({ where: { id } });
      return { deleted: row.providerName };
    }
    case 'auditLogs': {
      const row = await prisma.auditLog.delete({ where: { id } });
      return { deleted: row.id };
    }
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const configuredToken = process.env.DEPLOY_OS_ADMIN_TOKEN ?? '';
    if (!configuredToken) {
      return reply.code(503).send({ message: 'DEPLOY_OS_ADMIN_TOKEN is not configured on the server.' });
    }
    const providedToken = readAdminToken(request);
    if (!providedToken || !valuesEqual(providedToken, configuredToken)) {
      return reply.code(401).send({ message: 'Invalid admin access token.' });
    }
  });

  app.get('/database/overview', async () => {
    const [
      projects,
      users,
      deployKeys,
      workflowFiles,
      environmentVariables,
      projectDatabases,
      deployments,
      deploymentLogs,
      domains,
      dnsProviders,
      auditLogs,
      projectOptions,
    ] = await Promise.all([
      prisma.project.count(),
      prisma.user.count(),
      prisma.deployKey.count(),
      prisma.workflowFile.count(),
      prisma.environmentVariable.count(),
      prisma.projectDatabase.count(),
      prisma.deployment.count(),
      prisma.deploymentLog.count(),
      prisma.domain.count(),
      prisma.dnsProviderCredential.count(),
      prisma.auditLog.count(),
      prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    ]);

    const counts: Record<EntityKey, number> = {
      projects,
      users,
      deployKeys,
      workflowFiles,
      environmentVariables,
      projectDatabases,
      deployments,
      deploymentLogs,
      domains,
      dnsProviders,
      auditLogs,
    };

    return {
      totalRecords: Object.values(counts).reduce((sum, value) => sum + value, 0),
      highlights: { projects, deployments, projectDatabases, logs: deploymentLogs + auditLogs },
      projects: projectOptions,
      categories: categories.map((category) => ({
        ...category,
        count: category.entities.reduce((sum, entity) => sum + counts[entity], 0),
        entities: category.entities.map((entity) => ({ key: entity, label: entityLabels[entity], count: counts[entity] })),
      })),
    };
  });

  app.get('/database/records', async (request) => {
    const query = listQuerySchema.parse(request.query);
    let records = await loadRecords(query.entity);

    if (query.projectId) {
      records = records.filter((record) => record.projectId === query.projectId);
    }
    if (query.search) {
      const needle = query.search.toLowerCase();
      records = records.filter((record) => normalizeSearch(record).includes(needle));
    }

    const total = records.length;
    const start = (query.page - 1) * query.pageSize;
    const paginated = records.slice(start, start + query.pageSize);

    return {
      entity: query.entity,
      label: entityLabels[query.entity],
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      records: paginated,
    };
  });

  app.delete('/database/records/:entity/:id', async (request, reply) => {
    const params = z.object({ entity: entitySchema, id: z.string().min(1) }).parse(request.params);
    const body = deleteBodySchema.parse(request.body);
    try {
      const result = await deleteRecord(params.entity, params.id, body.dropPhysicalDatabase);
      return reply.send({ ok: true, ...result });
    } catch (error) {
      request.log.error({ err: error, entity: params.entity, id: params.id }, 'Admin database record deletion failed');
      return reply.code(409).send({ message: error instanceof Error ? error.message : 'Record deletion failed.' });
    }
  });

  app.get('/logs', async (request) => {
    const query = logQuerySchema.parse(request.query);
    const [auditRows, deploymentRows, projectOptions] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 3000 }),
      prisma.deploymentLog.findMany({
        orderBy: { createdAt: 'desc' },
        include: { deployment: { include: { project: { select: { id: true, name: true, slug: true } } } } },
        take: 3000,
      }),
      prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    ]);

    const projectMap = new Map<string, { id: string; name: string; slug: string }>(
      projectOptions.map((project: any) => [project.id, { id: project.id, name: project.name, slug: project.slug }]),
    );

    const activity = auditRows.map((row: any) => {
      const projectId = projectIdFromMetadata(row.metadata);
      const project = projectId ? projectMap.get(projectId) : undefined;
      const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
      const statusCode = typeof metadata.statusCode === 'number' ? metadata.statusCode : null;
      return {
        id: `audit:${row.id}`,
        source: 'Activity',
        category: categoryFromTarget(row.target, row.action),
        projectId,
        projectName: project?.name ?? null,
        level: statusCode && statusCode >= 400 ? 'error' : 'info',
        title: row.action,
        message: row.target,
        statusCode,
        createdAt: row.createdAt.toISOString(),
        details: metadata,
      };
    });

    const deployment = deploymentRows.map((row: any) => ({
      id: `deployment:${row.id}`,
      source: 'Deployment',
      category: 'Deployments',
      projectId: row.deployment.project.id,
      projectName: row.deployment.project.name,
      level: row.level,
      title: row.message,
      message: `Deployment ${row.deploymentId} · ${row.deployment.branch}`,
      statusCode: null,
      createdAt: row.createdAt.toISOString(),
      details: {
        deploymentId: row.deploymentId,
        deploymentStatus: row.deployment.status,
        commitSha: row.deployment.commitSha,
      },
    }));

    let logs = [...activity, ...deployment].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    if (query.type === 'activity') logs = logs.filter((log) => log.source === 'Activity');
    if (query.type === 'deployments') logs = logs.filter((log) => log.source === 'Deployment');
    if (query.type === 'errors') logs = logs.filter((log) => log.level.toLowerCase() === 'error' || (log.statusCode ?? 0) >= 400);
    if (query.type === 'data') logs = logs.filter((log) => log.category === 'Database' || log.category === 'Data management');
    if (query.projectId) logs = logs.filter((log) => log.projectId === query.projectId);
    if (query.category) logs = logs.filter((log) => log.category === query.category);
    if (query.search) {
      const needle = query.search.toLowerCase();
      logs = logs.filter((log) => JSON.stringify(log).toLowerCase().includes(needle));
    }

    const categoriesAvailable = Array.from(new Set([...activity, ...deployment].map((log) => log.category))).sort();
    const total = logs.length;
    const start = (query.page - 1) * query.pageSize;

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      categories: categoriesAvailable,
      projects: projectOptions,
      counts: {
        all: activity.length + deployment.length,
        activity: activity.length,
        deployments: deployment.length,
        errors: [...activity, ...deployment].filter((log) => log.level.toLowerCase() === 'error' || (log.statusCode ?? 0) >= 400).length,
        data: [...activity, ...deployment].filter((log) => log.category === 'Database' || log.category === 'Data management').length,
      },
      logs: logs.slice(start, start + query.pageSize),
    };
  });
}
