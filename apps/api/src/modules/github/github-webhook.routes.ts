import type { FastifyInstance } from 'fastify';
import { setGitHubCommitStatus, verifyResolvedGitHubWebhookSignature } from '../../lib/github-app.js';
import { prisma } from '../../lib/prisma.js';
import { createQueuedDeployment } from '../deployments/deployment.service.js';
import { markGitHubInstallationDeleted, syncGitHubInstallation } from './github.service.js';

type WebhookPayload = {
  action?: string;
  ref?: string;
  after?: string;
  deleted?: boolean;
  installation?: { id?: number };
  repository?: { full_name?: string };
};

export async function githubWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.post('/', async (request, reply) => {
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body || ''));
    const signature = request.headers['x-hub-signature-256'];
    if (!await verifyResolvedGitHubWebhookSignature(rawBody, Array.isArray(signature) ? signature[0] : signature)) {
      return reply.code(401).send({ message: 'Invalid GitHub webhook signature.' });
    }

    const eventHeader = request.headers['x-github-event'];
    const deliveryHeader = request.headers['x-github-delivery'];
    const event = String(Array.isArray(eventHeader) ? eventHeader[0] : eventHeader || 'unknown');
    const deliveryId = String(Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader || '');
    if (!deliveryId) return reply.code(400).send({ message: 'Missing X-GitHub-Delivery header.' });

    const existing = await prisma.gitHubWebhookDelivery.findUnique({ where: { deliveryId } });
    if (existing && existing.status !== 'FAILED') {
      return reply.code(202).send({ ok: true, reused: true, status: existing.status });
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
    } catch {
      return reply.code(400).send({ message: 'Webhook payload is not valid JSON.' });
    }

    const installationId = payload.installation?.id ? String(payload.installation.id) : null;
    const repositoryFullName = payload.repository?.full_name?.toLowerCase() || null;
    await prisma.gitHubWebhookDelivery.upsert({
      where: { deliveryId },
      create: {
        deliveryId,
        event,
        action: payload.action || null,
        installationId,
        repositoryFullName,
        status: 'RECEIVED',
      },
      update: {
        event,
        action: payload.action || null,
        installationId,
        repositoryFullName,
        status: 'RECEIVED',
        projectCount: 0,
        errorMessage: null,
        processedAt: null,
      },
    });

    try {
      if (event === 'ping') {
        await prisma.gitHubWebhookDelivery.update({ where: { deliveryId }, data: { status: 'PROCESSED', processedAt: new Date() } });
        return { ok: true, event };
      }

      if ((event === 'installation' || event === 'installation_repositories') && installationId) {
        if (event === 'installation' && payload.action === 'deleted') await markGitHubInstallationDeleted(installationId);
        else await syncGitHubInstallation(installationId);
        await prisma.gitHubWebhookDelivery.update({ where: { deliveryId }, data: { status: 'PROCESSED', processedAt: new Date() } });
        return { ok: true, event };
      }

      if (event !== 'push' || !installationId || !repositoryFullName || payload.deleted) {
        await prisma.gitHubWebhookDelivery.update({ where: { deliveryId }, data: { status: 'IGNORED', processedAt: new Date() } });
        return { ok: true, event, ignored: true };
      }

      const branch = payload.ref?.startsWith('refs/heads/') ? payload.ref.slice('refs/heads/'.length) : '';
      const commit = payload.after || '';
      if (!branch || !/^[a-f0-9]{40}$/i.test(commit) || /^0+$/.test(commit)) {
        await prisma.gitHubWebhookDelivery.update({ where: { deliveryId }, data: { status: 'IGNORED', processedAt: new Date() } });
        return { ok: true, event, ignored: true };
      }

      const projects = await prisma.project.findMany({
        where: {
          repositoryFullName,
          githubInstallationId: installationId,
          deploymentMethod: 'GITHUB_APP',
          autoDeployEnabled: true,
          defaultBranch: branch,
        },
      });

      let queued = 0;
      for (const project of projects) {
        const result = await createQueuedDeployment({
          projectId: project.id,
          branch,
          commit,
          externalRunId: `github-app:${deliveryId}:${project.id}`,
          runAttempt: 1,
          triggerMethod: 'GITHUB_APP',
          logMessage: `Queued from GitHub App push webhook for ${repositoryFullName}@${commit.slice(0, 12)}.`,
        });
        if (!result.reused) queued += 1;
        await setGitHubCommitStatus({
          installationId,
          repositoryFullName,
          commit,
          state: 'pending',
          description: 'Deployment queued on Hredoy Deploy OS',
          targetUrl: `${(process.env.DEPLOY_OS_PUBLIC_URL || 'https://vps.techteamlead.com').replace(/\/+$/, '')}/projects/${project.id}`,
        }).catch((statusError) => request.log.warn({ err: statusError, projectId: project.id }, 'GitHub commit status could not be created'));
      }

      await prisma.gitHubWebhookDelivery.update({
        where: { deliveryId },
        data: { status: 'PROCESSED', projectCount: queued, processedAt: new Date() },
      });
      return reply.code(202).send({ ok: true, event, queued });
    } catch (error) {
      await prisma.gitHubWebhookDelivery.update({
        where: { deliveryId },
        data: {
          status: 'FAILED',
          errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
          processedAt: new Date(),
        },
      }).catch(() => undefined);
      throw error;
    }
  });
}
