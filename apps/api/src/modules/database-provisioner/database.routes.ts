import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Client } from 'pg';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';
import { assertSafeDatabaseIdentifier } from '../../lib/validation.js';

const provisionSchema = z.object({
  databaseName: z.string().trim().min(3),
  username: z.string().trim().min(3),
  password: z.string().min(12),
  migrationMode: z.enum(['MIGRATE_DEPLOY', 'DB_PUSH', 'SKIP']).default('MIGRATE_DEPLOY'),
});

type PgError = Error & {
  code?: string;
  detail?: string;
};

function isPgError(error: unknown): error is PgError {
  return error instanceof Error;
}

async function formatSql(
  client: Client,
  template: string,
  values: string[],
): Promise<string> {
  const placeholders = values.map((_, index) => `$${index + 2}`).join(', ');
  const result = await client.query<{ statement: string }>(
    `SELECT format($1, ${placeholders}) AS statement`,
    [template, ...values],
  );
  const statement = result.rows[0]?.statement;
  if (!statement) throw new Error('PostgreSQL did not return a provisioning statement.');
  return statement;
}

function publicProvisioningMessage(error: unknown): string {
  if (!isPgError(error)) return 'Database provisioning failed.';

  switch (error.code) {
    case '42501':
      return 'Database provisioning permission denied. The POSTGRES_ADMIN_URL role needs CREATEDB and CREATEROLE privileges.';
    case '28P01':
      return 'POSTGRES_ADMIN_URL authentication failed. Check the admin username and password.';
    case '3D000':
      return 'The PostgreSQL admin database in POSTGRES_ADMIN_URL does not exist.';
    case '08001':
    case '08006':
    case 'ECONNREFUSED':
      return 'Deploy OS could not connect to PostgreSQL through POSTGRES_ADMIN_URL.';
    default:
      return error.message || 'Database provisioning failed.';
  }
}

export async function databaseRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:projectId/database/provision', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = provisionSchema.parse(request.body);
    assertSafeDatabaseIdentifier(body.databaseName, 'Database name');
    assertSafeDatabaseIdentifier(body.username, 'Database user');

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });

    const managedConflict = await prisma.projectDatabase.findFirst({
      where: {
        projectId: { not: projectId },
        OR: [
          { databaseName: body.databaseName },
          { username: body.username },
        ],
      },
      select: {
        databaseName: true,
        username: true,
      },
    });

    if (managedConflict) {
      return reply.code(409).send({
        message:
          managedConflict.databaseName === body.databaseName
            ? 'This database name is already assigned to another Deploy OS project.'
            : 'This database username is already assigned to another Deploy OS project.',
      });
    }

    const adminUrl = process.env.POSTGRES_ADMIN_URL;
    if (!adminUrl) {
      return reply.code(500).send({ message: 'POSTGRES_ADMIN_URL is missing on the Deploy OS server.' });
    }

    const client = new Client({ connectionString: adminUrl });

    try {
      await client.connect();

      const roleResult = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists',
        [body.username],
      );
      const roleExists = roleResult.rows[0]?.exists === true;

      const roleStatement = roleExists
        ? await formatSql(client, 'ALTER ROLE %I WITH LOGIN PASSWORD %L', [body.username, body.password])
        : await formatSql(client, 'CREATE ROLE %I WITH LOGIN PASSWORD %L', [body.username, body.password]);
      await client.query(roleStatement);

      const databaseResult = await client.query<{ owner: string }>(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1',
        [body.databaseName],
      );
      const existingDatabaseOwner = databaseResult.rows[0]?.owner;
      const databaseExists = Boolean(existingDatabaseOwner);

      if (databaseExists && existingDatabaseOwner !== body.username) {
        const ownerConflict = new Error(
          `Database ${body.databaseName} already exists and is owned by another PostgreSQL role.`,
        ) as PgError;
        ownerConflict.code = 'DEPLOY_OS_DB_OWNER_CONFLICT';
        throw ownerConflict;
      }

      if (!databaseExists) {
        const createDatabaseStatement = await formatSql(
          client,
          'CREATE DATABASE %I OWNER %I',
          [body.databaseName, body.username],
        );
        await client.query(createDatabaseStatement);
      } else {
        const ownerStatement = await formatSql(
          client,
          'ALTER DATABASE %I OWNER TO %I',
          [body.databaseName, body.username],
        );
        await client.query(ownerStatement);
      }

      const grantStatement = await formatSql(
        client,
        'GRANT ALL PRIVILEGES ON DATABASE %I TO %I',
        [body.databaseName, body.username],
      );
      await client.query(grantStatement);
    } catch (error) {
      request.log.error(
        {
          err: error,
          projectId,
          databaseName: body.databaseName,
          databaseUser: body.username,
        },
        'Project database provisioning failed',
      );

      return reply.code(500).send({
        message: publicProvisioningMessage(error),
        code: isPgError(error) ? error.code : undefined,
      });
    } finally {
      await client.end().catch(() => undefined);
    }

    const projectHost = process.env.POSTGRES_PROJECT_HOST ?? 'postgres';
    const projectPort = Number(process.env.POSTGRES_PROJECT_PORT ?? '5432');
    if (!Number.isInteger(projectPort) || projectPort < 1 || projectPort > 65535) {
      return reply.code(500).send({ message: 'POSTGRES_PROJECT_PORT must be a valid TCP port.' });
    }

    const url = `postgresql://${body.username}:${encodeURIComponent(body.password)}@${projectHost}:${projectPort}/${body.databaseName}?schema=public`;
    const encryptedPassword = encryptSecret(body.password);
    const encryptedUrl = encryptSecret(url);

    const existingDatabase = await prisma.projectDatabase.findFirst({
      where: { projectId, databaseName: body.databaseName },
      orderBy: { createdAt: 'desc' },
    });

    const db = existingDatabase
      ? await prisma.projectDatabase.update({
          where: { id: existingDatabase.id },
          data: {
            type: 'POSTGRESQL',
            host: projectHost,
            port: projectPort,
            username: body.username,
            encryptedPassword,
            generatedDatabaseUrl: encryptedUrl,
            migrationMode: body.migrationMode,
            status: 'CREATED',
          },
        })
      : await prisma.projectDatabase.create({
          data: {
            projectId,
            type: 'POSTGRESQL',
            host: projectHost,
            port: projectPort,
            databaseName: body.databaseName,
            username: body.username,
            encryptedPassword,
            generatedDatabaseUrl: encryptedUrl,
            migrationMode: body.migrationMode,
            status: 'CREATED',
          },
        });

    await prisma.environmentVariable.upsert({
      where: {
        projectId_environment_key: {
          projectId,
          environment: 'production',
          key: 'DATABASE_URL',
        },
      },
      update: {
        encryptedValue: encryptedUrl,
        isSecret: true,
        isSystemManaged: true,
      },
      create: {
        projectId,
        environment: 'production',
        key: 'DATABASE_URL',
        encryptedValue: encryptedUrl,
        isSecret: true,
        isSystemManaged: true,
      },
    });

    return reply.code(existingDatabase ? 200 : 201).send({
      id: db.id,
      status: db.status,
      databaseName: db.databaseName,
      username: db.username,
      host: db.host,
      port: db.port,
      reused: Boolean(existingDatabase),
    });
  });
}
