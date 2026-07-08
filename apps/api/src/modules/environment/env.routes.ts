import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';

const envSchema = z.object({
  environment: z.string().default('production'),
  variables: z.record(z.string())
});

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) throw new Error(`Invalid env line: ${line}`);
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) throw new Error(`Invalid env key: ${key}`);
    value = value.replace(/^['"]|['"]$/g, '');
    result[key] = value;
  }
  return result;
}

export async function envRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:projectId/env', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = envSchema.parse(request.body);
    const writes = Object.entries(body.variables).map(([key, value]) => prisma.environmentVariable.upsert({
      where: { projectId_environment_key: { projectId, environment: body.environment, key } },
      update: { encryptedValue: encryptSecret(value), isSecret: !key.startsWith('NEXT_PUBLIC_') },
      create: { projectId, environment: body.environment, key, encryptedValue: encryptSecret(value), isSecret: !key.startsWith('NEXT_PUBLIC_') }
    }));
    await Promise.all(writes);
    return reply.send({ ok: true, count: writes.length });
  });

  app.get('/:projectId/env', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const variables = await prisma.environmentVariable.findMany({ where: { projectId }, orderBy: { key: 'asc' } });
    return variables.map((variable: (typeof variables)[number]) => ({ ...variable, encryptedValue: variable.isSecret ? '********' : variable.encryptedValue }));
  });
}
