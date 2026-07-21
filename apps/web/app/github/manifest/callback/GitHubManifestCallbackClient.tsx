'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';

export function GitHubManifestCallbackClient() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  const state = searchParams.get('state') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Creating the managed GitHub App securely…');
  const [installUrl, setInstallUrl] = useState('');

  useEffect(() => {
    if (!code || !state) {
      setStatus('error');
      setMessage('GitHub did not return a valid App registration code. Start Connect GitHub again.');
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/github/manifest/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 409) throw new Error(payload.message || 'GitHub App registration could not be completed.');
        const url = String(payload.installUrl || '');
        if (!url) throw new Error('GitHub App was created, but its installation URL is missing.');
        setInstallUrl(url);
        setStatus('success');
        setMessage(payload.message || 'GitHub App created. Continue to choose account and repository access.');
        window.setTimeout(() => window.location.assign(url), 900);
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'GitHub App registration could not be completed.');
      }
    })();
  }, [code, state]);

  return (
    <AppShell
      active="github"
      title="Preparing GitHub connection"
      description="Deploy OS is completing the one-time GitHub App registration before repository access is selected."
      backHref="/github"
      backLabel="GitHub connections"
    >
      <section className="panel">
        <div className={`toast ${status === 'success' ? 'success' : status === 'error' ? 'error' : ''}`}>{message}</div>
        <div className="inline-actions" style={{ marginTop: 18 }}>
          {installUrl ? <a className="btn" href={installUrl}>Continue to GitHub</a> : null}
          <Link className="btn secondary" href="/github">Back to GitHub connections</Link>
        </div>
      </section>
    </AppShell>
  );
}
