import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeployToken, verifyDeployToken } from '../apps/api/src/lib/deploy-token.js';
import { parseGitHubRepository } from '../apps/api/src/lib/repository.js';
import { detectFramework } from '../packages/framework-detector/src/index.js';
import { generateDockerfile } from '../packages/dockerfile-generator/src/index.js';

const root = process.cwd();

function pass(name: string): void {
  console.log(`PASS: ${name}`);
}

const httpsRepo = parseGitHubRepository('https://github.com/Example/Project.git');
assert.equal(httpsRepo.fullName, 'Example/Project');
assert.equal(httpsRepo.sshUrl, 'git@github.com:Example/Project.git');
const sshRepo = parseGitHubRepository('git@github.com:Example/Project.git');
assert.equal(sshRepo.httpsUrl, 'https://github.com/Example/Project.git');
pass('GitHub HTTPS and SSH repository normalization');

const token = createDeployToken('sample-project');
assert.ok(token.token.startsWith('dep_live_sample-project_'));
assert.ok(verifyDeployToken(token.token, token.hash));
assert.equal(verifyDeployToken(`${token.token}x`, token.hash), false);
pass('One-time deploy token hashing and verification');

const fixture = mkdtempSync(join(tmpdir(), 'hredoy-deploy-qa-'));
try {
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ scripts: { build: 'next build', start: 'next start' }, dependencies: { next: '15.5.20' } }));
  writeFileSync(join(fixture, 'package-lock.json'), '{}');
  const plan = detectFramework(fixture);
  assert.equal(plan.framework, 'nextjs');
  assert.equal(plan.installCommand, 'npm ci');

  const dockerfile = generateDockerfile(plan, {
    installCommand: plan.installCommand,
    buildCommand: plan.buildCommand,
    startCommand: plan.startCommand,
    port: 3000,
  });
  assert.match(dockerfile, /JSON\.parse/);
  assert.match(dockerfile, /--mount=type=secret,id=deploy_env/);
  assert.doesNotMatch(dockerfile, /\. \/run\/secrets\/deploy_env/);
  assert.match(dockerfile, /EXPOSE 3000/);
  pass('Framework detection and non-evaluated JSON build secrets');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const workflow = readFileSync(join(root, 'templates/github-actions/deploy.yml'), 'utf8');
for (const required of ['DEPLOY_API_URL', 'DEPLOY_TOKEN', 'github.run_id', 'github.run_attempt', '--retry-all-errors', 'concurrency:']) {
  assert.ok(workflow.includes(required), `Workflow is missing ${required}`);
}
pass('GitHub Actions template retry, idempotency and concurrency fields');

const deployScript = readFileSync(join(root, 'scripts/deploy-vps.sh'), 'utf8');
assert.ok(deployScript.includes('git config --local core.sshCommand'));
assert.ok(deployScript.includes('pm2 startOrReload'));
assert.ok(!deployScript.includes('pm2 delete deploy-os'));
assert.ok(!deployScript.includes('fuser -k 3000'));
pass('VPS deployment uses repository-scoped SSH and graceful PM2 reload');

const envExample = readFileSync(join(root, '.env.example'), 'utf8');
assert.ok(envExample.includes('RUNNER_PUBLIC_SCHEME=http'));
assert.ok(envExample.includes('RUNNER_PROJECT_LOCK_WAIT_MS='));
pass('Safe default route scheme and project deployment lock settings');

console.log('\nHredoy Deploy OS deployment-flow QA passed.');
