'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hredoy-deploy-os-admin-token';

type AccessContext = {
  token: string;
  lock: () => void;
  handleUnauthorized: () => void;
};

type AdminAccessGateProps = {
  children: (context: AccessContext) => ReactNode;
};

export function AdminAccessGate({ children }: AdminAccessGateProps) {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setToken(window.sessionStorage.getItem(STORAGE_KEY) ?? '');
  }, []);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) {
      setStatus('error');
      setMessage('Enter the admin access token.');
      return;
    }

    setStatus('checking');
    setMessage('');
    try {
      const response = await fetch('/api/admin/database/overview', {
        headers: { 'x-deploy-os-admin-token': draft.trim() },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.message === 'string' ? payload.message : 'Admin access failed.');
      }
      window.sessionStorage.setItem(STORAGE_KEY, draft.trim());
      setToken(draft.trim());
      setDraft('');
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Admin access failed.');
    }
  };

  const lock = () => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setToken('');
    setDraft('');
    setMessage('');
    setStatus('idle');
  };

  if (!token) {
    return (
      <section className="panel admin-access-panel">
        <div>
          <p className="panel-kicker">Protected section</p>
          <h2 className="panel-title">Admin access required</h2>
          <p className="panel-subtitle">
            Database records and logs contain operational information. Enter the server admin token to continue.
          </p>
        </div>
        <form onSubmit={verify} className="admin-access-form">
          <div className="field">
            <label htmlFor="admin-token">Admin token</label>
            <input
              id="admin-token"
              className="input"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="DEPLOY_OS_ADMIN_TOKEN"
            />
          </div>
          <button className="btn" type="submit" disabled={status === 'checking'}>
            {status === 'checking' ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {status === 'error' ? <div className="toast error">{message}</div> : null}
        <div className="notice">
          Configure <strong>DEPLOY_OS_ADMIN_TOKEN</strong> in the VPS <code>.env</code>. The token is kept only in this browser tab.
        </div>
      </section>
    );
  }

  return children({
    token,
    lock,
    handleUnauthorized: lock,
  });
}
