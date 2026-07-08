import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Client } from 'pg';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';
import { assertSafeDatabaseIdentifier } from '../../lib/validation.js';

const provisionSchema = z.object({
  databaseName: z.string(),
  username: z.string(),
  password: z.string().min(12),
  migrationMode: z.enum(['MIGRATE_DEPLOY', 'DB_PUSH', 'SKIP']).default('MIGRATE_DEPLOY')
});

export async function databaseRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:projectId/database/provision', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = provisionSchema.parse(request.body);
    assertSafeDatabaseIdentifier(body.databaseName, 'Database name');
    assertSafeDatabaseIdentifier(body.username, 'Database user');

    const adminUrl = process.env.POSTGRES_ADMIN_URL;
    if (!adminUrl) return reply.code(500).send({ message: 'POSTGRES_ADMIN_URL is missing' });

    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      await client.query(`CREATE USER ${body.username} WITH PASSWORD $1`, [body.password]).catch((error: unknown) => {
        if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
      });
      await client.query(`CREATE DATABASE ${body.databaseName} OWNER ${body.username}`).catch((error: unknown) => {
        if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
      });
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${body.databaseName} TO ${body.username}`);
    } finally {
      await client.end();
    }

    const host = process.env.POSTGRES_PROJECT_HOST ?? 'postgres';
    const url = `postgresql://${body.username}:${encodeURIComponent(body.password)}@${host}:5432/${body.databaseName}?schema=public`;

    const db = await prisma.projectDatabase.create({
      data: {
        projectId,
        type: 'POSTGRESQL',
        host,
        databaseName: body.databaseName,
        username: body.username,
        encryptedPassword: encryptSecret(body.password),
        generatedDatabaseUrl: encryptSecret(url),
        migrationMode: body.migrationMode,
        status: 'CREATED'
      }
    });

    await prisma.environmentVariable.upsert({
      where: { projectId_environment_key: { projectId, environment: 'production', key: 'DATABASE_URL' } },
      update: { encryptedValue: encryptSecret(url), isSystemManaged: true },
      create: { projectId, environment: 'production', key: 'DATABASE_URL', encryptedValue: encryptSecret(url), isSecret: true, isSystemManaged: true }
    });

    return reply.code(201).send({ id: db.id, status: db.status, databaseName: db.databaseName, username: db.username });
  });
}
