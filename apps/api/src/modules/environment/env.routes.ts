import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';

const envSchema = z.object({
  environment: z.string().trim().min(1).max(40).default('production'),
  variables: z.record(z.string().max(64), z.string()),
  replace: z.boolean().default(false),
});

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const equalsIndex = separator.indexOf('=');
    if (equalsIndex === -1) throw new Error(`Invalid env line ${index + 1}: missing = sign.`);
    const key = separator.slice(0, equalsIndex).trim();
    let value = separator.slice(equalsIndex + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) throw new Error(`Invalid env key on line ${index + 1}: ${key}`);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function envRoutes(app: FastifyInstance): Promise<void> {
  app.post('/:projectId/env', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = envSchema.parse(request.body);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });

    const entries = Object.entries(body.variables);
    await prisma.$transaction(async (tx: any) => {
      if (body.replace) {
        const retainedKeys = entries.map(([key]) => key);
        await tx.environmentVariable.deleteMany({
          where: {
            projectId,
            environment: body.environment,
            isSystemManaged: false,
            ...(retainedKeys.length ? { key: { notIn: retainedKeys } } : {}),
          },
        });
      }

      for (const [key, value] of entries) {
        const isSecret = !key.startsWith('NEXT_PUBLIC_') && !key.startsWith('PUBLIC_');
        await tx.environmentVariable.upsert({
          where: { projectId_environment_key: { projectId, environment: body.environment, key } },
          update: { encryptedValue: encryptSecret(value), isSecret, isSystemManaged: false },
          create: { projectId, environment: body.environment, key, encryptedValue: encryptSecret(value), isSecret, isSystemManaged: false },
        });
      }
    });

    return reply.send({ ok: true, count: entries.length, replaced: body.replace });
  });

  app.get('/:projectId/env', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found.' });
    const variables = await prisma.environmentVariable.findMany({ where: { projectId }, orderBy: [{ environment: 'asc' }, { key: 'asc' }] });
    return variables.map((variable: any) => ({
      id: variable.id,
      key: variable.key,
      environment: variable.environment,
      isSecret: variable.isSecret,
      isSystemManaged: variable.isSystemManaged,
      updatedAt: variable.updatedAt,
      value: variable.isSecret ? '********' : 'Configured',
    }));
  });

  app.delete('/:projectId/env/:variableId', async (request, reply) => {
    const { projectId, variableId } = request.params as { projectId: string; variableId: string };
    const variable = await prisma.environmentVariable.findFirst({ where: { id: variableId, projectId } });
    if (!variable) return reply.code(404).send({ message: 'Environment variable not found.' });
    if (variable.isSystemManaged) {
      return reply.code(409).send({ message: 'System-managed variables must be changed through their owning feature.' });
    }
    await prisma.environmentVariable.delete({ where: { id: variableId } });
    return { ok: true, deleted: variable.key };
  });
}
