import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const createProjectSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  repoUrl: z.string().url().optional(),
  defaultBranch: z.string().default('main')
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    return prisma.project.findMany({ orderBy: { createdAt: 'desc' }, include: { domains: true, deployments: { take: 1, orderBy: { createdAt: 'desc' } } } });
  });

  app.post('/', async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const user = await prisma.user.upsert({
      where: { email: 'owner@techteam.local' },
      create: { email: 'owner@techteam.local', name: 'Deploy OS Owner' },
      update: {}
    });
    const project = await prisma.project.create({ data: { ownerId: user.id, ...body, sourceType: 'GITHUB' } });
    return reply.code(201).send(project);
  });

  app.get('/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { domains: true, deployments: true, envVars: true, databases: true } });
    if (!project) return reply.code(404).send({ message: 'Project not found' });
    return project;
  });
}
