import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectFramework } from '@techteam/framework-detector';
import { generateDockerfile } from '@techteam/dockerfile-generator';
import { runCommand } from '../lib/shell.js';

interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  commit: string;
}

export async function runDeploymentJob(data: DeploymentJobData): Promise<void> {
  const workspaceRoot = process.env.RUNNER_WORKSPACE ?? '/opt/techteam-deploy/projects';
  const repoDir = join(workspaceRoot, data.projectId, 'repo');
  mkdirSync(repoDir, { recursive: true });

  // MVP placeholder: production will fetch project repo + encrypted deploy key from API/DB.
  console.log(`Starting deployment ${data.deploymentId} for commit ${data.commit}`);

  const plan = detectFramework(repoDir);
  if (plan.dockerStrategy === 'generated-dockerfile') {
    writeFileSync(join(repoDir, 'Dockerfile.deployos'), generateDockerfile(plan));
  }

  const tag = `techteam/${data.projectId}:${data.commit.slice(0, 12)}`;
  const dockerfile = plan.dockerStrategy === 'generated-dockerfile' ? 'Dockerfile.deployos' : 'Dockerfile';

  await runCommand('docker', ['build', '-f', dockerfile, '-t', tag, '.'], repoDir);

  const containerName = `${data.projectId}-${data.commit.slice(0, 12)}`;
  await runCommand('docker', ['rm', '-f', containerName]).catch(() => ({ stdout: '', stderr: '' }));
  await runCommand('docker', [
    'run', '-d',
    '--name', containerName,
    '--network', process.env.RUNNER_DOCKER_NETWORK ?? 'techteam-deploy-network',
    '--memory', process.env.RUNNER_MEMORY_LIMIT ?? '1g',
    '--cpus', process.env.RUNNER_CPU_LIMIT ?? '1',
    tag
  ]);

  console.log(`Container started: ${containerName}. Proxy switch should run after health check.`);
}
