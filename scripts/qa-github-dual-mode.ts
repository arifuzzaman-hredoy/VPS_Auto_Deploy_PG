import assert from 'node:assert/strict';
import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildGitHubAppManifest,
  createGitHubAppJwt,
  createGitHubManifestState,
  verifyGitHubManifestState,
  verifyGitHubWebhookSignature,
} from '../apps/api/src/lib/github-app.js';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const schema = read('apps/api/prisma/schema.prisma');
for (const required of [
  'enum DeploymentMethod',
  'GITHUB_APP',
  'GITHUB_ACTIONS',
  'githubInstallationId',
  'githubRepositoryId',
  'model GitHubAppConfiguration',
  'encryptedPrivateKey',
  'encryptedWebhookSecret',
  'model GitHubInstallation',
  'model GitHubRepository',
  'model GitHubWebhookDelivery',
]) assert.ok(schema.includes(required), `Prisma schema missing ${required}`);
console.log('PASS: Dual GitHub deployment and managed App schema');

const prismaDelegateFiles = [
  'apps/api/src/lib/github-app.ts',
  'apps/api/src/modules/admin/admin.routes.ts',
  'apps/api/src/modules/github/github-webhook.routes.ts',
  'apps/api/src/modules/github/github.routes.ts',
  'apps/api/src/modules/github/github.service.ts',
  'apps/api/src/modules/projects/project.routes.ts',
  'apps/runner/src/lib/github-app.ts',
];
for (const file of prismaDelegateFiles) {
  const source = read(file);
  assert.ok(!source.includes('prisma.githubInstallation'), `${file} uses invalid githubInstallation Prisma delegate casing`);
  assert.ok(!source.includes('prisma.githubRepository'), `${file} uses invalid githubRepository Prisma delegate casing`);
  assert.ok(!source.includes('prisma.githubWebhookDelivery'), `${file} uses invalid githubWebhookDelivery Prisma delegate casing`);
  assert.ok(!source.includes('prisma.githubAppConfiguration'), `${file} uses invalid githubAppConfiguration Prisma delegate casing`);
}
const prismaDelegateSource = prismaDelegateFiles.map(read).join('\n');
for (const required of ['prisma.gitHubAppConfiguration', 'prisma.gitHubInstallation', 'prisma.gitHubRepository', 'prisma.gitHubWebhookDelivery']) {
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
process.env.DEPLOY_OS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DEPLOY_OS_PUBLIC_URL = 'https://vps.techteamlead.com';

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

const state = createGitHubManifestState();
assert.equal(verifyGitHubManifestState(state), true);
assert.equal(verifyGitHubManifestState(`${state}changed`), false);
const manifest = buildGitHubAppManifest() as {
  name?: string;
  redirect_url?: string;
  setup_url?: string;
  hook_attributes?: { url?: string; active?: boolean };
  default_permissions?: Record<string, string>;
  default_events?: string[];
  request_oauth_on_install?: boolean;
  public?: boolean;
};
assert.match(manifest.name || '', /^Hredoy Deploy OS /);
assert.equal(manifest.redirect_url, 'https://vps.techteamlead.com/github/manifest/callback');
assert.equal(manifest.setup_url, 'https://vps.techteamlead.com/github/setup');
assert.equal(manifest.hook_attributes?.url, 'https://vps.techteamlead.com/api/github/webhook');
assert.equal(manifest.hook_attributes?.active, true);
assert.equal(manifest.default_permissions?.contents, 'read');
assert.equal(manifest.default_permissions?.statuses, 'write');
assert.deepEqual(manifest.default_events, ['push']);
assert.equal(manifest.default_events?.includes('installation'), false);
assert.equal(manifest.default_events?.includes('installation_repositories'), false);
assert.equal(manifest.request_oauth_on_install, false);
assert.equal(manifest.public, true);
console.log('PASS: One-click GitHub App manifest uses only subscribable events and minimum repository access');

const githubApp = read('apps/api/src/lib/github-app.ts');
for (const required of ['/app-manifests/', '/access_tokens', 'X-GitHub-Api-Version', '/statuses/', 'readManagedCredentials', 'encryptedPrivateKey']) {
  assert.ok(githubApp.includes(required), `GitHub App library missing ${required}`);
}
const githubRoutes = read('apps/api/src/modules/github/github.routes.ts');
for (const required of ["app.get('/connect-flow'", "app.post('/manifest/complete'", 'https://github.com/settings/apps/new', 'gitHubAppConfiguration.upsert', 'encryptSecret(converted.pem)']) {
  assert.ok(githubRoutes.includes(required), `GitHub connection route missing ${required}`);
}
const runnerGitHub = read('apps/runner/src/lib/github-app.ts');
assert.ok(runnerGitHub.includes('gitHubAppConfiguration.findUnique'));
assert.ok(runnerGitHub.includes('decryptSecret(managed.encryptedPrivateKey)'));
console.log('PASS: Managed or environment GitHub App credentials support API and runner');

const webhook = read('apps/api/src/modules/github/github-webhook.routes.ts');
for (const required of ['x-hub-signature-256', 'x-github-delivery', 'verifyResolvedGitHubWebhookSignature', "event !== 'push'", 'autoDeployEnabled: true', 'createQueuedDeployment']) {
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
console.log('PASS: GitHub Actions, connected GitHub and manual deploy share one runner');

const connectButton = read('apps/web/app/components/GitHubConnectButton.tsx');
assert.ok(connectButton.includes("fetch('/api/github/connect-flow'"));
assert.ok(connectButton.includes("input.name = 'manifest'"));
assert.ok(connectButton.includes('window.location.assign'));
const callback = read('apps/web/app/github/manifest/callback/GitHubManifestCallbackClient.tsx');
assert.ok(callback.includes("fetch('/api/github/manifest/complete'"));
assert.ok(callback.includes('window.location.assign(url)'));
const githubPage = read('apps/web/app/github/page.tsx');
assert.ok(githubPage.includes('GitHubConnectButton'));
assert.ok(githubPage.includes('One-time automatic setup'));
const setupPage = read('apps/web/app/github/setup/GitHubSetupClient.tsx');
assert.ok(setupPage.includes('Opening repository import'));
assert.ok(setupPage.includes('window.location.assign(`/projects/new?installationId='));

const createPage = read('apps/web/app/projects/new/page.tsx');
assert.ok(createPage.includes('deploymentMethod: "GITHUB_ACTIONS"'));
assert.ok(createPage.includes('Connect GitHub — automatic push deploy'));
assert.ok(createPage.includes('Repository URL — GitHub Actions setup'));
assert.ok(createPage.includes('Direct webhook deploy is unavailable until GitHub is connected.'));
assert.ok(createPage.includes('Download deploy.yml'));
const projectPanel = read('apps/web/app/components/ProjectCiCdPanel.tsx');
assert.ok(projectPanel.includes('const [methodView'));
assert.ok(projectPanel.includes('The project stays on GitHub Actions until you activate the selected repository.'));
assert.ok(projectPanel.includes('Use selected GitHub App repository'));
assert.ok(projectPanel.includes("fetch('/api/deployments/manual'"));
assert.ok(projectPanel.includes('Wait for production deployment'));
assert.ok(projectPanel.includes('LIVE) echo'));
console.log('PASS: Existing design exposes one-click connected GitHub and URL-only Actions setup');

const adminRoutes = read('apps/api/src/modules/admin/admin.routes.ts');
assert.ok(adminRoutes.includes("'githubAppConfiguration'"));
assert.ok(adminRoutes.includes("field('Private key', 'Encrypted and hidden')"));
assert.ok(adminRoutes.includes("field('Webhook secret', 'Encrypted and hidden')"));
const databasePage = read('apps/web/app/database/page.tsx');
assert.ok(databasePage.includes("| 'githubAppConfiguration'"));
console.log('PASS: Managed GitHub App records are visible with sensitive values redacted');

const env = read('.env.example');
for (const required of ['GitHub App environment override (optional)', 'GITHUB_APP_ID=', 'GITHUB_APP_SLUG=', 'GITHUB_APP_PRIVATE_KEY_BASE64=', 'GITHUB_APP_WEBHOOK_SECRET=']) {
  assert.ok(env.includes(required), `.env.example missing ${required}`);
}
const workflow = read('templates/github-actions/deploy.yml');
assert.ok(workflow.includes('deployment_id'));
assert.ok(workflow.includes('Wait for production deployment'));
assert.ok(workflow.includes('LIVE)'));
const setupDocs = read('docs/GITHUB_APP_SETUP.md');
for (const required of ['App manifest flow', 'X-Hub-Signature-256', 'Repository URL — GitHub Actions setup', 'No App ID, PEM key or webhook secret']) {
  assert.ok(setupDocs.includes(required), `GitHub setup docs missing ${required}`);
}
console.log('PASS: One-click GitHub and manual Actions setup documentation');

console.log('\nHredoy Deploy OS dual GitHub mode QA passed.');
