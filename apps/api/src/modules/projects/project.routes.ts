import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { encryptSecret } from '../../lib/crypto.js';
import { createDeployToken } from '../../lib/deploy-token.js';
import { parseGitHubRepository } from '../../lib/repository.js';
import { generateOpenSshEd25519KeyPair } from '../../lib/ssh-key.js';
import { normalizeHostname } from '../../lib/validation.js';

const commandSchema = z.string().trim().max(300).refine(
  (value) => !/[\r\n\0]/.test(value),
  'Commands cannot contain line breaks.',
);


const rootDirectorySchema = z.string().trim().max(200).default('.').transform((value) => value || '.').refine(
  (value) => value === '.' || (!value.startsWith('/') && !value.includes('\\') && value.split('/').every((part) => part && part !== '.' && part !== '..')),
  'Root directory must be a safe relative path inside the repository.',
);

const projectBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repoUrl: z.string().trim().min(1),
  defaultBranch: z.string().trim().min(1).max(120).default('main'),
  rootDirectory: rootDirectorySchema,
  installCommand: commandSchema.optional().nullable(),
  buildCommand: commandSchema.default(''),
  startCommand: commandSchema.default(''),
  appPort: z.coerce.number().int().min(1).max(65535).default(3000),
  healthPath: z.string().trim().max(200).default('/').transform((value) => value.startsWith('/') ? value : `/${value}`),
  primaryDomain: z.string().trim().optional().nullable(),
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

function normalizeProjectData(body: z.infer<typeof projectBodySchema> | z.infer<typeof updateProjectSchema>) {
  const data: Record<string, unknown> = { ...body };
  if (typeof body.repoUrl === 'string') {
    const repository = parseGitHubRepository(body.repoUrl);
    data.repoUrl = repository.httpsUrl;
    data.repositoryFullName = repository.fullName.toLowerCase();
  }
  if ('primaryDomain' in body) {
    data.primaryDomain = body.primaryDomain ? normalizeHostname(body.primaryDomain) : null;
  }
  if ('installCommand' in body) {
    data.installCommand = body.installCommand || null;
  }
  return data;
}

const projectInclude = {
  domains: { orderBy: { createdAt: 'desc' as const } },
  databases: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  deployments: {
    orderBy: { createdAt: 'desc' as const },
    take: 10,
    include: { logs: { orderBy: { createdAt: 'asc' as const }, take: 200 } },
  },
  _count: { select: { envVars: true, deployKeys: true, deployments: true, domains: true } },
};

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        domains: { where: { isPrimary: true }, take: 1 },
        deployments: { take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { envVars: true, domains: true, deployments: true } },
      },
    });
    return projects.map((project: any) => ({
      ...project,
      deployTokenHash: undefined,
      deployTokenConfigured: Boolean(project.deployTokenHash),
    }));
  });

  app.post('/', async (request, reply) => {
    const body = projectBodySchema.parse(request.body);
    const user = await prisma.user.upsert({
      where: { email: 'owner@techteam.local' },
      create: { email: 'owner@techteam.local', name: 'Deploy OS Owner' },
      update: {},
    });

    const normalizedData = normalizeProjectData(body);
    const existing = await prisma.project.findUnique({ where: { slug: body.slug } });
    if (existing) {
      const project = await prisma.project.update({
        where: { id: existing.id },
        data: normalizedData as never,
      });
      return reply.send({ ...project, deployTokenHash: undefined, deployTokenConfigured: Boolean(project.deployTokenHash), reused: true });
    }

    try {
      const project = await prisma.project.create({
        data: { ownerId: user.id, ...normalizedData, name: body.name, slug: body.slug, sourceType: 'GITHUB' } as never,
      });
      return reply.code(201).send({ ...project, deployTokenHash: undefined, deployTokenConfigured: false });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.code(409).send({ message: 'This project slug is already in use.' });
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
      const project = await prisma.project.update({ where: { id: projectId }, data: normalizeProjectData(body) as never });
      return reply.send({ ...project, deployTokenHash: undefined, deployTokenConfigured: Boolean(project.deployTokenHash) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return reply.code(409).send({ message: 'This project slug is already in use.' });
      }
      throw error;
    }
  });

  app.post('/:projectId/deploy-token', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ message: 'Project not found' });

    const generated = createDeployToken(project.slug);
    await prisma.project.update({
      where: { id: projectId },
      data: { deployTokenHash: generated.hash, deployTokenPrefix: generated.prefix, status: 'READY_FOR_CI' },
    });

    return reply.code(201).send({
      token: generated.token,
      prefix: generated.prefix,
      message: 'Copy this token now. Deploy OS stores only its hash and cannot show it again.',
    });
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

    const generated = generateOpenSshEd25519KeyPair(`hredoy-deploy-${project.slug}`);
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

    return prisma.deployKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, publicKey: true, fingerprint: true, isActive: true, createdAt: true },
    });
  });

  app.get('/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) return reply.code(404).send({ message: 'Project not found' });
    return { ...project, deployTokenHash: undefined, deployTokenConfigured: Boolean(project.deployTokenHash) };
  });
}
