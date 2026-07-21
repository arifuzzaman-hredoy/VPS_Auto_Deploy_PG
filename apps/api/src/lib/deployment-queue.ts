import { Queue } from 'bullmq';

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

const deploymentQueue = new Queue('deployments', { connection });

export async function addDeploymentJob(input: { deploymentId: string; projectId: string; commit?: string | null }): Promise<void> {
  await deploymentQueue.add(
    'deploy',
    { deploymentId: input.deploymentId, projectId: input.projectId, commit: input.commit || '' },
    {
      jobId: input.deploymentId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  );
}

export async function closeDeploymentQueue(): Promise<void> {
  await deploymentQueue.close();
}
