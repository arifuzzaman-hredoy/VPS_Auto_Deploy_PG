import 'dotenv/config';
import { Worker } from 'bullmq';
import { runDeploymentJob } from './workers/deployment.worker.js';

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

const worker = new Worker('deployments', async (job) => runDeploymentJob(job.data), { connection, concurrency: 1 });

worker.on('completed', (job) => console.log(`Deployment job completed: ${job.id}`));
worker.on('failed', (job, error) => console.error(`Deployment job failed: ${job?.id}`, error));

console.log('TechTeam Deploy OS runner started.');
