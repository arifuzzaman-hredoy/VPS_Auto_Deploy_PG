import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

export type GitHubAppConfiguration = {
  configured: boolean;
  appId: string | null;
  appSlug: string | null;
  installUrl: string | null;
  setupUrl: string;
  webhookUrl: string;
  missing: string[];
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

function getPublicUrl(): string {
  return (process.env.DEPLOY_OS_PUBLIC_URL || 'https://vps.techteamlead.com').replace(/\/+$/, '');
}

function getPrivateKey(): string {
  const base64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (base64) return Buffer.from(base64, 'base64').toString('utf8');

  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) throw new Error('GITHUB_APP_PRIVATE_KEY_BASE64 or GITHUB_APP_PRIVATE_KEY is not configured.');
  return raw.replace(/\\n/g, '\n');
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function getGitHubAppConfiguration(): GitHubAppConfiguration {
  const appId = process.env.GITHUB_APP_ID?.trim() || null;
  const appSlug = process.env.GITHUB_APP_SLUG?.trim() || null;
  const missing: string[] = [];
  if (!appId) missing.push('GITHUB_APP_ID');
  if (!appSlug) missing.push('GITHUB_APP_SLUG');
  if (!process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim() && !process.env.GITHUB_APP_PRIVATE_KEY?.trim()) {
    missing.push('GITHUB_APP_PRIVATE_KEY_BASE64');
  }
  if (!process.env.GITHUB_APP_WEBHOOK_SECRET?.trim()) missing.push('GITHUB_APP_WEBHOOK_SECRET');

  const publicUrl = getPublicUrl();
  return {
    configured: missing.length === 0,
    appId,
    appSlug,
    installUrl: appSlug ? `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new` : null,
    setupUrl: `${publicUrl}/github/setup`,
    webhookUrl: `${publicUrl}/api/github/webhook`,
    missing,
  };
}

export function createGitHubAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) throw new Error('GITHUB_APP_ID is not configured.');

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const encodedPayload = base64UrlJson({ iat: now - 60, exp: now + 540, iss: appId });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(getPrivateKey()).toString('base64url');
  return `${signingInput}.${signature}`;
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
    throw new Error(`GitHub API: ${message}`);
  }
  return payload as T;
}

export async function getGitHubInstallation(installationId: string): Promise<GitHubInstallationResponse> {
  return githubRequest<GitHubInstallationResponse>(`/app/installations/${encodeURIComponent(installationId)}`, {}, createGitHubAppJwt());
}

export async function createGitHubInstallationToken(installationId: string): Promise<{ token: string; expiresAt: string }> {
  const result = await githubRequest<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { method: 'POST' },
    createGitHubAppJwt(),
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

export function verifyGitHubWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
