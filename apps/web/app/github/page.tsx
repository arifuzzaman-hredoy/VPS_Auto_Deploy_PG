'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';

type GitHubStatus = {
  configured: boolean;
  installUrl: string | null;
  setupUrl: string;
  webhookUrl: string;
  missing: string[];
  connectedInstallations: number;
};

type Installation = {
  id: string;
  externalId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  status: string;
  updatedAt: string;
  _count: { repositories: number };
};

export default function GitHubPage() {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState('');

  const load = useCallback(async () => {
    setMessage('');
    const [statusResponse, installationResponse] = await Promise.all([
      fetch('/api/github/status', { cache: 'no-store' }),
      fetch('/api/github/installations', { cache: 'no-store' }),
    ]);
    const statusPayload = await statusResponse.json().catch(() => ({}));
    const installationPayload = await installationResponse.json().catch(() => []);
    if (!statusResponse.ok) throw new Error(statusPayload.message || 'GitHub App status could not be loaded.');
    setStatus(statusPayload as GitHubStatus);
    setInstallations(Array.isArray(installationPayload) ? installationPayload as Installation[] : []);
  }, []);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : 'GitHub data could not be loaded.')); }, [load]);

  const refreshInstallation = async (installationId: string) => {
    setWorking(installationId);
    setMessage('');
    try {
      const response = await fetch(`/api/github/installations/${installationId}/refresh`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Installation refresh failed.');
      setMessage('GitHub repositories refreshed successfully.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Installation refresh failed.');
    } finally {
      setWorking('');
    }
  };

  return (
    <AppShell
      active="github"
      title="GitHub connections"
      description="Install the Hredoy Deploy OS GitHub App for Vercel-like repository import, while keeping GitHub Actions available for advanced CI/CD."
      actions={status?.installUrl ? <a className="btn" href={status.installUrl}>Connect GitHub</a> : undefined}
    >
      {message ? <div className="toast">{message}</div> : null}

      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">GitHub App</p>
                <h2 className="panel-title">Vercel-like repository connection</h2>
                <p className="panel-subtitle">Install once, select allowed repositories, then import and deploy them directly from this panel.</p>
              </div>
              <span className="badge">{status?.configured ? 'Configured' : 'Setup required'}</span>
            </div>

            {status?.configured ? (
              <div className="notice"><strong>Ready:</strong> GitHub App authentication and signed webhook delivery are configured.</div>
            ) : (
              <div className="toast error">Missing server variables: {status?.missing?.join(', ') || 'Loading configuration…'}</div>
            )}

            <div className="review-list" style={{ marginTop: 16 }}>
              <Review label="Setup URL" value={status?.setupUrl || 'Loading…'} />
              <Review label="Webhook URL" value={status?.webhookUrl || 'Loading…'} />
              <Review label="Connected accounts" value={String(status?.connectedInstallations ?? 0)} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Installations</p>
                <h2 className="panel-title">Connected accounts and organizations</h2>
                <p className="panel-subtitle">Only repositories granted to the GitHub App appear in the project creation flow.</p>
              </div>
              <button className="btn secondary" type="button" onClick={() => void load()}>Refresh list</button>
            </div>

            {installations.length === 0 ? <div className="empty-state">No GitHub App installation is connected yet.</div> : (
              <div className="stack">
                {installations.map((installation) => (
                  <div className="details-box" key={installation.id}>
                    <div className="details-content">
                      <div className="panel-header">
                        <div>
                          <strong>{installation.accountLogin}</strong>
                          <p className="panel-subtitle">{installation.accountType} · {installation.repositorySelection} repository access</p>
                        </div>
                        <span className="badge">{installation.status}</span>
                      </div>
                      <div className="review-list">
                        <Review label="Installation ID" value={installation.externalId} />
                        <Review label="Repositories" value={String(installation._count.repositories)} />
                        <Review label="Last sync" value={new Date(installation.updatedAt).toLocaleString()} />
                      </div>
                      <button className="btn secondary" type="button" disabled={working === installation.externalId} onClick={() => void refreshInstallation(installation.externalId)} style={{ marginTop: 14 }}>
                        {working === installation.externalId ? 'Refreshing…' : 'Refresh repositories'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel">
            <p className="panel-kicker">Two deployment ways</p>
            <h2 className="panel-title">Choose per project</h2>
            <div className="checklist" style={{ marginTop: 14 }}>
              <div className="check-row done"><span className="check-icon">✓</span><span>GitHub App webhook mode</span></div>
              <div className="check-row done"><span className="check-icon">✓</span><span>GitHub Actions token mode</span></div>
              <div className="check-row done"><span className="check-icon">✓</span><span>Manual deploy remains available</span></div>
            </div>
          </section>
          <section className="panel">
            <p className="panel-kicker">Required App permissions</p>
            <h2 className="panel-title">Minimum access</h2>
            <div className="review-list" style={{ marginTop: 14 }}>
              <Review label="Repository contents" value="Read-only" />
              <Review label="Metadata" value="Read-only" />
              <Review label="Commit statuses" value="Read and write" />
              <Review label="Webhook events" value="Push, installation, installation repositories" />
            </div>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="review-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}
