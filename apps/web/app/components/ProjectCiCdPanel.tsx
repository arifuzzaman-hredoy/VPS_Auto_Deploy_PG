'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type DeploymentMethod = 'GITHUB_APP' | 'GITHUB_ACTIONS';

type GitHubInstallation = { externalId: string; accountLogin: string; _count: { repositories: number } };
type GitHubRepository = { githubId: string; fullName: string; defaultBranch: string; cloneUrl: string; private: boolean };
type GitHubBranch = { name: string; sha: string; protected: boolean };

type DeployKey = {
  id: string;
  publicKey: string;
  fingerprint: string;
  isActive: boolean;
  createdAt: string;
};

export function ProjectCiCdPanel({
  projectId,
  projectSlug,
  branch,
  repositoryFullName,
  deployTokenConfigured,
  deploymentMethod,
  autoDeployEnabled,
  githubInstallationId,
  githubRepositoryId,
  onUpdated,
}: {
  projectId: string;
  projectSlug: string;
  branch: string;
  repositoryFullName?: string | null;
  deployTokenConfigured: boolean;
  deploymentMethod: DeploymentMethod;
  autoDeployEnabled: boolean;
  githubInstallationId?: string | null;
  githubRepositoryId?: string | null;
  onUpdated?: () => void;
}) {
  const [keys, setKeys] = useState<DeployKey[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState('');
  const [manualCommit, setManualCommit] = useState('');
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [selectedInstallation, setSelectedInstallation] = useState(githubInstallationId || '');
  const [selectedRepository, setSelectedRepository] = useState(githubRepositoryId || '');
  const [selectedBranch, setSelectedBranch] = useState(branch);

  const yaml = useMemo(() => `name: Deploy with Hredoy Deploy OS

on:
  push:
    branches:
      - ${branch || 'main'}
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: hredoy-deploy-\${{ github.repository }}-\${{ github.ref_name }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 35
    steps:
      - name: Queue deployment
        id: queue
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          response="$(curl --fail-with-body --silent --show-error \
            --retry 3 --retry-all-errors \
            -X POST "$DEPLOY_API_URL/api/deployments/trigger" \
            -H "Authorization: Bearer $DEPLOY_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
              "projectSlug": "${projectSlug}",
              "repository": "\${{ github.repository }}",
              "branch": "\${{ github.ref_name }}",
              "commit": "\${{ github.sha }}",
              "runId": "\${{ github.run_id }}",
              "runAttempt": "\${{ github.run_attempt }}"
            }')"
          echo "$response"
          deployment_id="$(jq -r '.deploymentId // empty' <<<"$response")"
          test -n "$deployment_id" || { echo "Deploy OS did not return a deployment ID."; exit 1; }
          echo "deployment_id=$deployment_id" >> "$GITHUB_OUTPUT"

      - name: Wait for production deployment
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOYMENT_ID: \${{ steps.queue.outputs.deployment_id }}
        run: |
          for attempt in $(seq 1 180); do
            response="$(curl --fail-with-body --silent --show-error \
              --retry 3 --retry-all-errors \
              "$DEPLOY_API_URL/api/deployments/$DEPLOYMENT_ID")"
            status="$(jq -r '.status // empty' <<<"$response")"
            echo "Deploy OS status: \${status:-UNKNOWN} (check $attempt/180)"
            case "$status" in
              LIVE) echo "Deployment is live."; exit 0 ;;
              FAILED) echo "$response"; exit 1 ;;
            esac
            sleep 10
          done
          echo "Deployment did not finish within 30 minutes."
          exit 1
`, [branch, projectSlug]);

  const loadKeys = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/deploy-keys`, { cache: 'no-store' });
    const payload = await response.json().catch(() => []);
    if (response.ok && Array.isArray(payload)) setKeys(payload as DeployKey[]);
  }, [projectId]);

  useEffect(() => { if (deploymentMethod === 'GITHUB_ACTIONS') void loadKeys(); }, [deploymentMethod, loadKeys]);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/github/installations', { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (response.ok && Array.isArray(payload)) setInstallations(payload as GitHubInstallation[]);
    })();
  }, []);

  useEffect(() => {
    if (!selectedInstallation) { setRepositories([]); return; }
    void (async () => {
      const response = await fetch(`/api/github/installations/${selectedInstallation}/repositories`, { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (response.ok && Array.isArray(payload)) setRepositories(payload as GitHubRepository[]);
    })();
  }, [selectedInstallation]);

  useEffect(() => { setSelectedBranch(branch); }, [branch]);

  useEffect(() => {
    const repository = repositories.find((item) => item.githubId === selectedRepository);
    if (!selectedInstallation || !repository) { setBranches([]); return; }
    void (async () => {
      const response = await fetch(`/api/github/installations/${selectedInstallation}/branches?repository=${encodeURIComponent(repository.fullName)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(payload)) { setBranches([]); return; }
      const values = payload as GitHubBranch[];
      setBranches(values);
      setSelectedBranch((current) => values.some((item) => item.name === current) ? current : repository.defaultBranch || values[0]?.name || branch);
    })();
  }, [branch, repositories, selectedInstallation, selectedRepository]);

  const copy = async (name: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const updateAutomation = async (body: Record<string, unknown>) => {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Project automation could not be updated.');
      setMessage('Project deployment method updated. Only one automatic mode is active at a time.');
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project automation could not be updated.');
    } finally {
      setWorking(false);
    }
  };

  const createOrLoadKey = async () => {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Deploy key could not be loaded.');
      setMessage(payload.reused ? 'Existing active deploy key loaded.' : 'New deploy key generated.');
      await loadKeys();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Deploy key could not be loaded.');
    } finally {
      setWorking(false);
    }
  };

  const rotateToken = async () => {
    if (deployTokenConfigured && !window.confirm('Rotate the CI/CD token? The current GitHub secret will stop working immediately.')) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy-token`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'CI/CD token could not be generated.');
      setToken(String(payload.token || ''));
      setMessage('Copy the token now and replace the DEPLOY_TOKEN GitHub secret. It cannot be shown again.');
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CI/CD token could not be generated.');
    } finally {
      setWorking(false);
    }
  };

  const manualDeploy = async () => {
    if (manualCommit && !/^[a-f0-9]{7,64}$/i.test(manualCommit.trim())) {
      setMessage('Commit SHA must contain 7 to 64 hexadecimal characters. Leave it blank to deploy the latest production commit.');
      return;
    }
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/deployments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, commit: manualCommit.trim() || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Manual deployment could not be queued.');
      setMessage(`Deployment queued: ${String(payload.deploymentId || '').slice(0, 12)}…`);
      setManualCommit('');
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Manual deployment could not be queued.');
    } finally {
      setWorking(false);
    }
  };

  const activeKey = keys.find((key) => key.isActive) ?? keys[0];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Repository CI/CD</p>
          <h2 className="panel-title">GitHub connection</h2>
          <p className="panel-subtitle">Use the Vercel-like GitHub App or repository-managed GitHub Actions. Manual deploy remains available in both modes.</p>
        </div>
        <span className="badge">{repositoryFullName || 'Repository not set'}</span>
      </div>

      <div className="stack">
        <div className="details-box">
          <div className="details-content stack">
            <strong>Active automatic deployment method</strong>
            <select
              className="input"
              value={deploymentMethod}
              disabled={working}
              onChange={(event) => {
                const method = event.target.value as DeploymentMethod;
                if (method === 'GITHUB_APP' && !githubInstallationId) {
                  setMessage('Select a connected GitHub App repository below, then activate it.');
                  return;
                }
                void updateAutomation({ deploymentMethod: method });
              }}
            >
              <option value="GITHUB_APP">GitHub App — Recommended</option>
              <option value="GITHUB_ACTIONS">GitHub Actions</option>
            </select>
            <label className="check-row done">
              <input
                type="checkbox"
                checked={autoDeployEnabled}
                disabled={working}
                onChange={(event) => void updateAutomation({ autoDeployEnabled: event.target.checked })}
              />
              <span>Automatically deploy pushes to {branch}</span>
            </label>
          </div>
        </div>

        {deploymentMethod === 'GITHUB_APP' ? (
          <div className="details-box">
            <div className="details-content stack">
              <strong>GitHub App webhook mode</strong>
              <p className="panel-subtitle">No workflow file, repository secret or permanent deploy key is required. Deploy OS uses short-lived installation tokens.</p>
              <div className="grid grid-2">
                <select className="input" value={selectedInstallation} onChange={(event) => { setSelectedInstallation(event.target.value); setSelectedRepository(''); }}>
                  <option value="">Select connected account</option>
                  {installations.map((installation) => <option key={installation.externalId} value={installation.externalId}>{installation.accountLogin} · {installation._count.repositories} repos</option>)}
                </select>
                <select className="input" value={selectedRepository} onChange={(event) => {
                  const value = event.target.value;
                  setSelectedRepository(value);
                  const repository = repositories.find((item) => item.githubId === value);
                  setSelectedBranch(repository?.defaultBranch || branch);
                }}>
                  <option value="">Select repository</option>
                  {repositories.map((repository) => <option key={repository.githubId} value={repository.githubId}>{repository.fullName}{repository.private ? ' · private' : ''}</option>)}
                </select>
              </div>
              {branches.length > 0 ? (
                <select className="input" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
                  {branches.map((item) => <option key={item.name} value={item.name}>{item.name}{item.protected ? ' · protected' : ''}</option>)}
                </select>
              ) : null}
              <button className="btn secondary" type="button" disabled={working || !selectedInstallation || !selectedRepository || !selectedBranch} onClick={() => {
                const repository = repositories.find((item) => item.githubId === selectedRepository);
                if (!repository) return;
                void updateAutomation({
                  deploymentMethod: 'GITHUB_APP',
                  githubInstallationId: selectedInstallation,
                  githubRepositoryId: repository.githubId,
                  repoUrl: repository.cloneUrl,
                  defaultBranch: selectedBranch || repository.defaultBranch,
                });
              }}>Use selected GitHub App repository</button>
              <div className="review-list">
                <Review label="Installation" value={githubInstallationId || 'Not connected'} />
                <Review label="Production branch" value={branch} />
                <Review label="Push webhook" value={autoDeployEnabled ? 'Enabled' : 'Disabled'} />
              </div>
              <a className="btn secondary" href="/github">Manage GitHub connection</a>
            </div>
          </div>
        ) : (
          <>
            <div className="details-box">
              <div className="details-content stack">
                <strong>1. Repository deploy key</strong>
                <p className="panel-subtitle">Add this public key in GitHub → Settings → Deploy keys. Keep write access disabled.</p>
                {activeKey ? <pre className="code">{activeKey.publicKey}</pre> : <div className="empty-state">No active deploy key found.</div>}
                <div className="inline-actions">
                  <button className="btn secondary" type="button" disabled={working} onClick={createOrLoadKey}>{activeKey ? 'Reload key' : 'Generate key'}</button>
                  {activeKey ? <button className="btn secondary" type="button" onClick={() => copy('key', activeKey.publicKey)}>{copied === 'key' ? 'Copied' : 'Copy public key'}</button> : null}
                </div>
              </div>
            </div>

            <div className="details-box">
              <div className="details-content stack">
                <strong>2. GitHub Actions secrets</strong>
                <div className="review-list">
                  <Review label="DEPLOY_API_URL" value="https://vps.techteamlead.com" />
                  <Review label="DEPLOY_TOKEN" value={token ? 'Generated now' : deployTokenConfigured ? 'Configured' : 'Missing'} />
                </div>
                {token ? <><pre className="code">{token}</pre><button className="btn secondary" type="button" onClick={() => copy('token', token)}>{copied === 'token' ? 'Copied' : 'Copy DEPLOY_TOKEN'}</button></> : null}
                <button className="btn secondary" type="button" disabled={working} onClick={rotateToken}>{deployTokenConfigured ? 'Rotate CI/CD token' : 'Generate CI/CD token'}</button>
              </div>
            </div>

            <details className="details-box">
              <summary>3. Copy .github/workflows/deploy.yml</summary>
              <div className="details-content stack">
                <pre className="code tall">{yaml}</pre>
                <button className="btn secondary" type="button" onClick={() => copy('yaml', yaml)}>{copied === 'yaml' ? 'Copied' : 'Copy workflow YAML'}</button>
              </div>
            </details>
          </>
        )}

        <div className="details-box">
          <div className="details-content stack">
            <strong>Manual deployment</strong>
            <p className="panel-subtitle">Leave the commit empty to deploy the latest commit from {branch}, or enter an exact commit SHA.</p>
            <input className="input" value={manualCommit} onChange={(event) => setManualCommit(event.target.value)} placeholder="Optional commit SHA" />
            <button className="btn" type="button" disabled={working} onClick={manualDeploy}>{working ? 'Working…' : 'Deploy now'}</button>
          </div>
        </div>

        {message ? <div className="toast">{message}</div> : null}
      </div>
    </section>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="review-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}
