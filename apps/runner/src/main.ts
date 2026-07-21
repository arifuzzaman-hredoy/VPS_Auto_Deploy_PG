import 'dotenv/config';
import { Worker } from 'bullmq';
import { runDeploymentJob } from './workers/deployment.worker.js';
import { prisma } from './lib/prisma.js';

const connection = (() => {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    maxRetriesPerRequest: null,
  };
})();

const worker = new Worker('deployments', async (job) => runDeploymentJob(job.data), {
  connection,
  concurrency: Number(process.env.RUNNER_CONCURRENCY ?? 1),
  lockDuration: Number(process.env.RUNNER_LOCK_DURATION_MS ?? 1_800_000),
});

worker.on('completed', (job) => console.log(`Deployment job completed: ${job.id}`));
worker.on('failed', (job, error) => console.error(`Deployment job failed: ${job?.id}`, error));
worker.on('error', (error) => console.error('Deployment worker error', error));

async function shutdown(signal: string) {
  console.log(`Received ${signal}; closing Hredoy Deploy OS runner.`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

console.log('Hredoy Deploy OS runner started and is waiting for deployment jobs.');
