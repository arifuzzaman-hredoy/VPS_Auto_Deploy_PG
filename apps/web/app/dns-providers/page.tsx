'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';

type Provider = { id: string; provider: string; providerName: string; allowedZone?: string | null; status: string; createdAt: string };

export default function DnsProvidersPage() {
  const [providerName, setProviderName] = useState('');
  const [allowedZone, setAllowedZone] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [rows, setRows] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dns-providers', { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload.message || 'DNS providers could not be loaded.');
      setRows(Array.isArray(payload) ? payload : []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'DNS providers could not be loaded.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setWorking(true); setMessage('');
    try {
      const response = await fetch('/api/dns-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cloudflare', providerName, allowedZone, credential: { apiToken } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Cloudflare connection failed.');
      setMessage(`Cloudflare connection ${payload.providerName} saved and verified.`);
      setProviderName(''); setAllowedZone(''); setApiToken('');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Cloudflare connection failed.'); }
    finally { setWorking(false); }
  };

  const test = async (row: Provider) => {
    setMessage(`Testing ${row.providerName}…`);
    const response = await fetch(`/api/dns-providers/${row.id}/test`, { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message || (response.ok ? 'Connection verified.' : 'Connection test failed.'));
    await load();
  };

  const remove = async (row: Provider) => {
    if (!window.confirm(`Delete DNS connection ${row.providerName}?`)) return;
    const response = await fetch(`/api/dns-providers/${row.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? `${row.providerName} deleted.` : payload.message || 'Delete failed.');
    await load();
  };

  return (
    <AppShell active="dns" title="DNS providers" description="Connect an optional Cloudflare token for zone-aware DNS automation. Manual DNS remains available on every project." backHref="/" backLabel="Dashboard">
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Cloudflare connection</p><h2 className="panel-title">Add a scoped API token</h2><p className="panel-subtitle">Use a token limited to Zone Read and DNS Edit for one zone.</p></div></div>
            <div className="form-grid">
              <div className="field"><label>Connection label</label><input className="input" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Client Cloudflare account" /></div>
              <div className="field"><label>Allowed zone</label><input className="input" value={allowedZone} onChange={(event) => setAllowedZone(event.target.value)} placeholder="example.com" /></div>
              <div className="field full"><label>Cloudflare API token</label><input className="input" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Scoped API token" /><small>The token is verified before being encrypted and stored.</small></div>
            </div>
            <div className="inline-actions" style={{ marginTop: 16 }}><button className="btn" type="button" disabled={working || !providerName.trim() || !allowedZone.trim() || apiToken.length < 20} onClick={save}>{working ? 'Verifying…' : 'Verify and save'}</button></div>
            {message ? <div className="toast" style={{ marginTop: 16 }}>{message}</div> : null}
          </section>

          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Saved connections</p><h2 className="panel-title">DNS provider accounts</h2></div><button className="btn secondary" type="button" onClick={load}>Refresh</button></div>
            {loading ? <div className="empty-state">Loading connections…</div> : rows.length === 0 ? <div className="empty-state">No provider connection saved. Project domains can still be configured manually.</div> : <div className="table-wrap"><table className="table"><thead><tr><th>Label</th><th>Provider</th><th>Allowed zone</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.providerName}</strong></td><td>{row.provider}</td><td>{row.allowedZone || '—'}</td><td><span className="badge">{row.status}</span></td><td><div className="inline-actions"><button className="btn secondary small" type="button" onClick={() => void test(row)}>Test</button><button className="btn secondary small" type="button" onClick={() => void remove(row)}>Delete</button></div></td></tr>)}</tbody></table></div>}
          </section>
        </div>

        <aside className="stack summary-panel"><section className="panel"><p className="panel-kicker">Safe process</p><h2 className="panel-title">DNS connection rules</h2><div className="flow" style={{ marginTop: 14 }}>{[['1','Scope token','Allow only Zone Read and DNS Edit.'],['2','Limit zone','Deploy OS verifies the exact allowed zone.'],['3','Preview records','Project Domains shows records before saving.'],['4','Verify DNS','Route and ownership records must resolve.']].map(([number,title,text]) => <div className="step" key={number}><span className="step-no">{number}</span><p><strong>{title}</strong>{text}</p></div>)}</div></section><div className="notice"><strong>Current automation:</strong> Cloudflare credential verification is live. DNS record creation remains confirmation-first from the project domain workflow.</div></aside>
      </section>
    </AppShell>
  );
}
