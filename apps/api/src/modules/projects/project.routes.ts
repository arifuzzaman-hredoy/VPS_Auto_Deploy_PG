import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';
import { generateOpenSshEd25519KeyPair } from '../../lib/ssh-key.js';

const projectBodySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/),
  repoUrl: z.string().trim().url().optional(),
  defaultBranch: z.string().trim().min(1).default('main'),
});

const updateProjectSchema = projectBodySchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  'At least one project field is required',
);

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        domains: true,
        deployments: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  });

  app.post('/', async (request, reply) => {
    const body = projectBodySchema.parse(request.body);
    const user = await prisma.user.upsert({
      where: { email: 'owner@techteam.local' },
      create: { email: 'owner@techteam.local', name: 'Deploy OS Owner' },
      update: {},
    });

    const existing = await prisma.project.findUnique({ where: { slug: body.slug } });
    if (existing) {
      const project = await prisma.project.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          repoUrl: body.repoUrl,
          defaultBranch: body.defaultBranch,
        },
      });
      return reply.send({ ...project, reused: true });
    }

    try {
      const project = await prisma.project.create({
        data: { ownerId: user.id, ...body, sourceType: 'GITHUB' },
      });
      return reply.code(201).send(project);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.code(409).send({ message: 'A project with this slug already exists.' });
      }
      throw error;
    }
  });

  app.patch('/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = updateProjectSchema.parse(request.body);

    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) return reply.code(404).send({ message: 'Project not found' });

    try {
      const project = await prisma.project.update({ where: { id: projectId }, data: body });
      return reply.send(project);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.code(409).send({ message: 'A project with this slug already exists.' });
      }
      throw error;
    }
  });

  app.post('/:projectId/deploy-keys', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ message: 'Project not found' });

    const activeKey = await prisma.deployKey.findFirst({
      where: { projectId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeKey) {
      return reply.send({
        id: activeKey.id,
        publicKey: activeKey.publicKey,
        fingerprint: activeKey.fingerprint,
        createdAt: activeKey.createdAt,
        reused: true,
      });
    }

    const generated = generateOpenSshEd25519KeyPair(`deploy-os-${project.slug}`);
    const deployKey = await prisma.deployKey.create({
      data: {
        projectId,
        publicKey: generated.publicKey,
        encryptedPrivateKey: encryptSecret(generated.privateKey),
        fingerprint: generated.fingerprint,
        isActive: true,
      },
    });

    return reply.code(201).send({
      id: deployKey.id,
      publicKey: deployKey.publicKey,
      fingerprint: deployKey.fingerprint,
      createdAt: deployKey.createdAt,
      reused: false,
    });
  });

  app.get('/:projectId/deploy-keys', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ message: 'Project not found' });

    const keys = await prisma.deployKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        publicKey: true,
        fingerprint: true,
        isActive: true,
        createdAt: true,
      },
    });
    return reply.send(keys);
  });

  app.get('/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { domains: true, deployments: true, envVars: true, databases: true },
    });
    if (!project) return reply.code(404).send({ message: 'Project not found' });
    return project;
  });
}
