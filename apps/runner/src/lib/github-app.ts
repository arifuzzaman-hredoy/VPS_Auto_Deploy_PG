import { createSign } from 'node:crypto';

function getPrivateKey(): string {
  const base64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (base64) return Buffer.from(base64, 'base64').toString('utf8');
  const raw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!raw) throw new Error('GitHub App private key is not configured on the runner.');
  return raw.replace(/\\n/g, '\n');
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  if (!appId) throw new Error('GITHUB_APP_ID is not configured on the runner.');
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(getPrivateKey()).toString('base64url')}`;
}

async function createInstallationToken(installationId: string): Promise<string> {
  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${createAppJwt()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Hredoy-Deploy-OS-Runner',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as { token?: string; message?: string };
  if (!response.ok || !payload.token) throw new Error(`GitHub App token failed: ${payload.message || `HTTP ${response.status}`}`);
  return payload.token;
}

export async function createInstallationCloneUrl(installationId: string, repositoryFullName: string): Promise<string> {
  const token = await createInstallationToken(installationId);
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repositoryFullName}.git`;
}

export async function setGitHubCommitStatus(input: {
  installationId: string;
  repositoryFullName: string;
  commit: string;
  state: 'pending' | 'success' | 'failure' | 'error';
  description: string;
  targetUrl?: string | null;
}): Promise<void> {
  const token = await createInstallationToken(input.installationId);
  const response = await fetch(`https://api.github.com/repos/${input.repositoryFullName}/statuses/${input.commit}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Hredoy-Deploy-OS-Runner',
    },
    body: JSON.stringify({
      state: input.state,
      context: 'hredoy-deploy-os/deploy',
      description: input.description.slice(0, 140),
      target_url: input.targetUrl || undefined,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub commit status failed: ${payload.message || `HTTP ${response.status}`}`);
  }
}
