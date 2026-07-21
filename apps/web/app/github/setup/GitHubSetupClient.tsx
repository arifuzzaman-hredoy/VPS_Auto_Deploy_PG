'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../components/AppShell';

export function GitHubSetupClient() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installation_id') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Synchronizing GitHub repositories…');

  useEffect(() => {
    if (!installationId) {
      setStatus('error');
      setMessage('GitHub did not return an installation ID. Open GitHub connections and install the App again.');
      return;
    }
    void (async () => {
      try {
        const response = await fetch('/api/github/installations/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installationId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'GitHub App installation could not be synchronized.');
        setStatus('success');
        setMessage(`Connected ${payload.accountLogin || 'GitHub'} with ${payload.repositories?.length || 0} accessible repositories. Opening repository import…`);
        window.setTimeout(() => {
          window.location.assign(`/projects/new?installationId=${encodeURIComponent(installationId)}`);
        }, 900);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'GitHub App installation could not be synchronized.');
      }
    })();
  }, [installationId]);

  return (
    <AppShell active="github" title="GitHub connection setup" description="Deploy OS is verifying the App installation and importing allowed repositories." backHref="/github" backLabel="GitHub connections">
      <section className="panel">
        <div className={`toast ${status === 'success' ? 'success' : status === 'error' ? 'error' : ''}`}>{message}</div>
        <div className="inline-actions" style={{ marginTop: 18 }}>
          {status === 'success' ? <Link className="btn" href={`/projects/new?installationId=${encodeURIComponent(installationId)}`}>Import a repository</Link> : null}
          <Link className="btn secondary" href="/github">Open GitHub connections</Link>
        </div>
      </section>
    </AppShell>
  );
}
