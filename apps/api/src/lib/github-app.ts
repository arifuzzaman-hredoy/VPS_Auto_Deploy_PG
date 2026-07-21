import { createHash, createHmac, createSign, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptSecret } from './crypto.js';
import { prisma } from './prisma.js';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const MANIFEST_STATE_TTL_SECONDS = 10 * 60;

export type GitHubAppConfiguration = {
  configured: boolean;
  appId: string | null;
  appSlug: string | null;
  installUrl: string | null;
  setupUrl: string;
  webhookUrl: string;
  manifestCallbackUrl: string;
  missing: string[];
  source: 'environment' | 'managed' | 'missing';
  ownerLogin: string | null;
  htmlUrl: string | null;
};

type GitHubAppCredentials = {
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  clientId?: string | null;
  clientSecret?: string | null;
  source: 'environment' | 'managed';
  ownerLogin?: string | null;
  htmlUrl?: string | null;
};

export type GitHubInstallationResponse = {
  id: number;
  account: { id: number; login: string; type: string };
  target_type?: string;
  repository_selection: string;
  suspended_at?: string | null;
};

export type GitHubRepositoryResponse = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  updated_at?: string | null;
  owner: { login: string };
};

export type GitHubManifestConversion = {
  id: number;
  slug: string;
  client_id?: string;
  client_secret?: string;
  webhook_secret: string;
  pem: string;
  html_url?: string;
  owner?: { login?: string };
};

function getPublicUrl(): string {
  return (process.env.DEPLOY_OS_PUBLIC_URL || 'https://vps.techteamlead.com').replace(/\/+$/, '');
}

function decodePrivateKeyFromEnvironment(): string | null {
  const base64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (base64) return Buffer.from(base64, 'base64').toString('utf8');
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  return raw ? raw.replace(/\\n/g, '\n') : null;
}

function readEnvironmentCredentials(): GitHubAppCredentials | null {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const appSlug = process.env.GITHUB_APP_SLUG?.trim();
  const privateKey = decodePrivateKeyFromEnvironment();
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!appId || !appSlug || !privateKey || !webhookSecret) return null;
  return {
    appId,
    appSlug,
    privateKey,
    webhookSecret,
    clientId: process.env.GITHUB_APP_CLIENT_ID?.trim() || null,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET?.trim() || null,
    source: 'environment',
  };
}

async function readManagedCredentials(): Promise<GitHubAppCredentials | null> {
  const row = await prisma.gitHubAppConfiguration.findUnique({ where: { id: 'primary' } });
  if (!row) return null;
  return {
    appId: row.appId,
    appSlug: row.appSlug,
    privateKey: decryptSecret(row.encryptedPrivateKey),
    webhookSecret: decryptSecret(row.encryptedWebhookSecret),
    clientId: row.clientId,
    clientSecret: row.encryptedClientSecret ? decryptSecret(row.encryptedClientSecret) : null,
    source: 'managed',
    ownerLogin: row.ownerLogin,
    htmlUrl: row.htmlUrl,
  };
}

async function getCredentials(): Promise<GitHubAppCredentials> {
  const credentials = readEnvironmentCredentials() ?? await readManagedCredentials();
  if (!credentials) {
    throw Object.assign(new Error('GitHub App is not configured. Use Connect GitHub to create and install it.'), { statusCode: 503 });
  }
  return credentials;
}

function publicConfiguration(credentials: GitHubAppCredentials | null): GitHubAppConfiguration {
  const publicUrl = getPublicUrl();
  return {
    configured: Boolean(credentials),
    appId: credentials?.appId ?? null,
    appSlug: credentials?.appSlug ?? null,
    installUrl: credentials ? `https://github.com/apps/${encodeURIComponent(credentials.appSlug)}/installations/new` : null,
    setupUrl: `${publicUrl}/github/setup`,
    webhookUrl: `${publicUrl}/api/github/webhook`,
    manifestCallbackUrl: `${publicUrl}/github/manifest/callback`,
    missing: credentials ? [] : ['GitHub App registration'],
    source: credentials?.source ?? 'missing',
    ownerLogin: credentials?.ownerLogin ?? null,
    htmlUrl: credentials?.htmlUrl ?? null,
  };
}

export async function getGitHubAppConfiguration(): Promise<GitHubAppConfiguration> {
  return publicConfiguration(readEnvironmentCredentials() ?? await readManagedCredentials());
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createGitHubAppJwt(credentials?: { appId: string; privateKey: string }): string {
  const resolved = credentials ?? (() => {
    const environment = readEnvironmentCredentials();
    if (!environment) throw new Error('Environment GitHub App credentials are not configured.');
    return environment;
  })();

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const encodedPayload = base64UrlJson({ iat: now - 60, exp: now + 540, iss: resolved.appId });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(resolved.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

async function createResolvedGitHubAppJwt(): Promise<string> {
  const credentials = await getCredentials();
  return createGitHubAppJwt(credentials);
}

async function githubRequest<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': 'Hredoy-Deploy-OS',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message?: unknown }).message)
      : `GitHub API request failed with HTTP ${response.status}.`;
    throw Object.assign(new Error(`GitHub API: ${message}`), { statusCode: response.status >= 500 ? 502 : response.status });
  }
  return payload as T;
}

export function createGitHubManifestState(): string {
  const secret = process.env.DEPLOY_OS_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error('DEPLOY_OS_ENCRYPTION_KEY is required for the GitHub connection flow.');
  const payload = base64UrlJson({
    purpose: 'github-app-manifest',
    nonce: randomBytes(18).toString('base64url'),
    exp: Math.floor(Date.now() / 1000) + MANIFEST_STATE_TTL_SECONDS,
  });
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyGitHubManifestState(state: string): boolean {
  const secret = process.env.DEPLOY_OS_ENCRYPTION_KEY?.trim();
  if (!secret) return false;
  const [payload, signature] = state.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { purpose?: string; exp?: number };
    return decoded.purpose === 'github-app-manifest' && typeof decoded.exp === 'number' && decoded.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function buildGitHubAppManifest(): Record<string, unknown> {
  const publicUrl = getPublicUrl();
  const hostname = new URL(publicUrl).hostname.toLowerCase();
  const hostLabel = hostname.split('.')[0]?.replace(/[^a-z0-9-]/gi, '-').slice(0, 8) || 'server';
  const uniqueSuffix = createHash('sha256').update(hostname).digest('hex').slice(0, 6);
  return {
    name: `Hredoy Deploy OS ${hostLabel}-${uniqueSuffix}`,
    url: publicUrl,
    description: 'Self-hosted GitHub deployment automation for Hredoy Deploy OS.',
    hook_attributes: {
      url: `${publicUrl}/api/github/webhook`,
      active: true,
    },
    redirect_url: `${publicUrl}/github/manifest/callback`,
    setup_url: `${publicUrl}/github/setup`,
    setup_on_update: true,
    request_oauth_on_install: false,
    public: true,
    default_permissions: {
      contents: 'read',
      metadata: 'read',
      statuses: 'write',
    },
    default_events: ['push'],
  };
}

export async function convertGitHubAppManifest(code: string): Promise<GitHubManifestConversion> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(code)) throw Object.assign(new Error('GitHub manifest code is invalid.'), { statusCode: 400 });
  return githubRequest<GitHubManifestConversion>(`/app-manifests/${encodeURIComponent(code)}/conversions`, { method: 'POST' });
}

export async function getGitHubInstallation(installationId: string): Promise<GitHubInstallationResponse> {
  return githubRequest<GitHubInstallationResponse>(`/app/installations/${encodeURIComponent(installationId)}`, {}, await createResolvedGitHubAppJwt());
}

export async function createGitHubInstallationToken(installationId: string): Promise<{ token: string; expiresAt: string }> {
  const result = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { method: 'POST' },
    await createResolvedGitHubAppJwt(),
  );
  return { token: result.token, expiresAt: result.expires_at };
}

export async function listGitHubInstallationRepositories(installationId: string): Promise<GitHubRepositoryResponse[]> {
  const { token } = await createGitHubInstallationToken(installationId);
  const repositories: GitHubRepositoryResponse[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await githubRequest<{ total_count: number; repositories: GitHubRepositoryResponse[] }>(
      `/installation/repositories?per_page=100&page=${page}`,
      {},
      token,
    );
    repositories.push(...result.repositories);
    if (result.repositories.length < 100 || repositories.length >= result.total_count) break;
  }
  return repositories;
}

export async function listGitHubRepositoryBranches(installationId: string, repositoryFullName: string): Promise<Array<{ name: string; sha: string; protected: boolean }>> {
  const { token } = await createGitHubInstallationToken(installationId);
  const result = await githubRequest<Array<{ name: string; protected: boolean; commit: { sha: string } }>>(
    `/repos/${repositoryFullName}/branches?per_page=100`,
    {},
    token,
  );
  return result.map((branch) => ({ name: branch.name, sha: branch.commit.sha, protected: branch.protected }));
}

export async function getGitHubBranchHead(installationId: string, repositoryFullName: string, branch: string): Promise<string> {
  const { token } = await createGitHubInstallationToken(installationId);
  const result = await githubRequest<{ object: { sha: string } }>(
    `/repos/${repositoryFullName}/git/ref/heads/${encodeURIComponent(branch)}`,
    {},
    token,
  );
  return result.object.sha;
}

export async function setGitHubCommitStatus(input: {
  installationId: string;
  repositoryFullName: string;
  commit: string;
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string;
  targetUrl?: string | null;
}): Promise<void> {
  const { token } = await createGitHubInstallationToken(input.installationId);
  await githubRequest(
    `/repos/${input.repositoryFullName}/statuses/${input.commit}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: input.state,
        context: 'hredoy-deploy-os/deploy',
        description: input.description.slice(0, 140),
        target_url: input.targetUrl || undefined,
      }),
    },
    token,
  );
}

export function verifyGitHubWebhookSignature(rawBody: Buffer, signature: string | undefined, secretOverride?: string): boolean {
  const secret = secretOverride ?? process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function verifyResolvedGitHubWebhookSignature(rawBody: Buffer, signature: string | undefined): Promise<boolean> {
  const credentials = readEnvironmentCredentials() ?? await readManagedCredentials();
  return credentials ? verifyGitHubWebhookSignature(rawBody, signature, credentials.webhookSecret) : false;
}
