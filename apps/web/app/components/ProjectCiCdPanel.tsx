'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
}: {
  projectId: string;
  projectSlug: string;
  branch: string;
  repositoryFullName?: string | null;
  deployTokenConfigured: boolean;
}) {
  const [keys, setKeys] = useState<DeployKey[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState('');

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
  trigger-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Hredoy Deploy OS
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          curl --fail-with-body --silent --show-error \\
            --retry 3 --retry-all-errors \\
            -X POST "$DEPLOY_API_URL/api/deployments/trigger" \\
            -H "Authorization: Bearer $DEPLOY_TOKEN" \\
            -H "Content-Type: application/json" \\
            -d '{
              "projectSlug": "${projectSlug}",
              "repository": "\${{ github.repository }}",
              "branch": "\${{ github.ref_name }}",
              "commit": "\${{ github.sha }}",
              "runId": "\${{ github.run_id }}",
              "runAttempt": "\${{ github.run_attempt }}"
            }'
`, [branch, projectSlug]);

  const loadKeys = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/deploy-keys`, { cache: 'no-store' });
    const payload = await response.json().catch(() => []);
    if (response.ok && Array.isArray(payload)) setKeys(payload as DeployKey[]);
  }, [projectId]);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const copy = async (name: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(name);
    window.setTimeout(() => setCopied(''), 1500);
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'CI/CD token could not be generated.');
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
          <p className="panel-subtitle">Manage the private-repository deploy key, one-time API token and workflow from this project.</p>
        </div>
        <span className="badge">{repositoryFullName || 'Repository not set'}</span>
      </div>

      <div className="stack">
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
              <div className="review-row"><span>DEPLOY_API_URL</span><strong>https://vps.techteamlead.com</strong></div>
              <div className="review-row"><span>DEPLOY_TOKEN</span><strong>{token ? 'Generated now' : deployTokenConfigured ? 'Configured' : 'Missing'}</strong></div>
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

        {message ? <div className="toast">{message}</div> : null}
      </div>
    </section>
  );
}
