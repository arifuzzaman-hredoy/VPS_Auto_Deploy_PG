'use client';

import { useState } from 'react';

type ConnectFlow = {
  type: 'install' | 'manifest';
  actionUrl: string;
  manifest?: string;
  state?: string;
  message?: string;
};

export function GitHubConnectButton({
  label = 'Connect GitHub',
  className = 'btn',
  onError,
}: {
  label?: string;
  className?: string;
  onError?: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);

  const connect = async () => {
    setWorking(true);
    onError?.('');
    try {
      const response = await fetch('/api/github/connect-flow', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as Partial<ConnectFlow> & { message?: string };
      if (!response.ok || !payload.type || !payload.actionUrl) {
        throw new Error(payload.message || 'GitHub connection could not be started.');
      }

      if (payload.type === 'install') {
        window.location.assign(payload.actionUrl);
        return;
      }

      if (!payload.manifest || !payload.state) throw new Error('GitHub App registration data is incomplete.');
      const form = document.createElement('form');
      form.method = 'post';
      form.action = `${payload.actionUrl}?state=${encodeURIComponent(payload.state)}`;
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'manifest';
      input.value = payload.manifest;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub connection could not be started.';
      onError?.(message);
      setWorking(false);
    }
  };

  return (
    <button className={className} type="button" disabled={working} onClick={() => void connect()}>
      {working ? 'Opening GitHub…' : label}
    </button>
  );
}
