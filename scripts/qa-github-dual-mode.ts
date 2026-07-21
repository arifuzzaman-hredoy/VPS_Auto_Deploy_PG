import assert from 'node:assert/strict';
import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGitHubAppJwt, verifyGitHubWebhookSignature } from '../apps/api/src/lib/github-app.js';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const schema = read('apps/api/prisma/schema.prisma');
for (const required of [
  'enum DeploymentMethod',
  'GITHUB_APP',
  'GITHUB_ACTIONS',
  'githubInstallationId',
  'githubRepositoryId',
  'model GitHubInstallation',
  'model GitHubRepository',
  'model GitHubWebhookDelivery',
]) assert.ok(schema.includes(required), `Prisma schema missing ${required}`);
console.log('PASS: Dual GitHub deployment schema');


const prismaDelegateFiles = [
  'apps/api/src/modules/admin/admin.routes.ts',
  'apps/api/src/modules/github/github-webhook.routes.ts',
  'apps/api/src/modules/github/github.routes.ts',
  'apps/api/src/modules/github/github.service.ts',
  'apps/api/src/modules/projects/project.routes.ts',
];
for (const file of prismaDelegateFiles) {
  const source = read(file);
  assert.ok(!source.includes('prisma.githubInstallation'), `${file} uses invalid githubInstallation Prisma delegate casing`);
  assert.ok(!source.includes('prisma.githubRepository'), `${file} uses invalid githubRepository Prisma delegate casing`);
  assert.ok(!source.includes('prisma.githubWebhookDelivery'), `${file} uses invalid githubWebhookDelivery Prisma delegate casing`);
}
const prismaDelegateSource = prismaDelegateFiles.map(read).join('\n');
for (const required of ['prisma.gitHubInstallation', 'prisma.gitHubRepository', 'prisma.gitHubWebhookDelivery']) {
  assert.ok(prismaDelegateSource.includes(required), `Dual GitHub flow missing generated Prisma delegate ${required}`);
}
console.log('PASS: Generated Prisma GitHub delegate casing');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.GITHUB_APP_ID = '123456';
process.env.GITHUB_APP_SLUG = 'hredoy-deploy-os-test';
process.env.GITHUB_APP_PRIVATE_KEY_BASE64 = Buffer.from(privateKey).toString('base64');
process.env.GITHUB_APP_WEBHOOK_SECRET = 'qa-webhook-secret';

const jwt = createGitHubAppJwt();
const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
assert.equal(JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')).alg, 'RS256');
const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { iss: string; iat: number; exp: number };
assert.equal(payload.iss, '123456');
assert.ok(payload.exp > payload.iat && payload.exp - payload.iat <= 610);
const verifier = createVerify('RSA-SHA256');
verifier.update(`${encodedHeader}.${encodedPayload}`);
verifier.end();
assert.equal(verifier.verify(publicKey, Buffer.from(encodedSignature, 'base64url')), true);

const webhookBody = Buffer.from('{"zen":"secure webhook"}');
const webhookSignature = `sha256=${createHmac('sha256', process.env.GITHUB_APP_WEBHOOK_SECRET).update(webhookBody).digest('hex')}`;
assert.equal(verifyGitHubWebhookSignature(webhookBody, webhookSignature), true);
assert.equal(verifyGitHubWebhookSignature(Buffer.from('{"zen":"changed"}'), webhookSignature), false);
console.log('PASS: GitHub App RS256 JWT and webhook HMAC verification execute correctly');

const githubApp = read('apps/api/src/lib/github-app.ts');
assert.ok(githubApp.includes('/access_tokens'));
assert.ok(githubApp.includes('X-GitHub-Api-Version'));
assert.ok(githubApp.includes('/statuses/'));
console.log('PASS: Installation-token and commit-status GitHub API flow');

const webhook = read('apps/api/src/modules/github/github-webhook.routes.ts');
for (const required of ['x-hub-signature-256', 'x-github-delivery', "event !== 'push'", 'autoDeployEnabled: true', 'createQueuedDeployment']) {
  assert.ok(webhook.includes(required), `GitHub webhook flow missing ${required}`);
}
console.log('PASS: Idempotent signed push-webhook deployment flow');

const actionRoutes = read('apps/api/src/modules/deployments/deployment.routes.ts');
assert.ok(actionRoutes.includes("triggerMethod: 'GITHUB_ACTIONS'"));
assert.ok(actionRoutes.includes("app.post('/manual'"));
const runner = read('apps/runner/src/workers/deployment.worker.ts');
assert.ok(runner.includes("project.deploymentMethod === 'GITHUB_APP'"));
assert.ok(runner.includes('createInstallationCloneUrl'));
assert.ok(runner.includes('GIT_SSH_COMMAND'));
assert.ok(runner.includes("git', ['rev-parse'"));
console.log('PASS: GitHub Actions, GitHub App and manual deploy share one runner');

const createPage = read('apps/web/app/projects/new/page.tsx');
assert.ok(createPage.includes('GitHub App — Recommended'));
assert.ok(createPage.includes('GitHub Actions'));
assert.ok(createPage.includes('/api/github/installations'));
assert.ok(createPage.includes('/branches?repository='));
const projectPanel = read('apps/web/app/components/ProjectCiCdPanel.tsx');
assert.ok(projectPanel.includes('Use selected GitHub App repository'));
assert.ok(projectPanel.includes("fetch('/api/deployments/manual'"));
assert.ok(projectPanel.includes('Wait for production deployment'));
assert.ok(projectPanel.includes('LIVE) echo'));
console.log('PASS: Existing design exposes repository, branch, both GitHub methods and production polling');

const env = read('.env.example');
for (const required of ['GITHUB_APP_ID=', 'GITHUB_APP_SLUG=', 'GITHUB_APP_PRIVATE_KEY_BASE64=', 'GITHUB_APP_WEBHOOK_SECRET=']) {
  assert.ok(env.includes(required), `.env.example missing ${required}`);
}
const workflow = read('templates/github-actions/deploy.yml');
assert.ok(workflow.includes('deployment_id'));
assert.ok(workflow.includes('Wait for production deployment'));
assert.ok(workflow.includes('LIVE)'));
assert.ok(read('docs/GITHUB_APP_SETUP.md').includes('X-Hub-Signature-256'));
console.log('PASS: GitHub App server configuration and dual-mode setup documentation');

console.log('\nHredoy Deploy OS dual GitHub mode QA passed.');
