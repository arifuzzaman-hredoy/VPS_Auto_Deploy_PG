'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';

type DomainType = 'MAIN_DOMAIN' | 'SUBDOMAIN' | 'WILDCARD_SUBDOMAIN' | 'SAAS_TENANT_WILDCARD';
type DomainRecord = {
  id: string;
  hostname: string;
  type: DomainType;
  isPrimary: boolean;
  expectedRecordType?: string | null;
  expectedRecordName?: string | null;
  expectedRecordValue?: string | null;
  verificationTxtName?: string | null;
  verificationTxtValue?: string | null;
  dnsStatus: string;
  ownershipStatus: string;
  routeStatus: string;
  status: string;
  errorMessage?: string | null;
};
type Plan = { hostname: string; records: Array<{ type: string; name: string; value: string; ttl: number; purpose: string }> };

export default function DomainsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [type, setType] = useState<DomainType>('SUBDOMAIN');
  const [domain, setDomain] = useState('');
  const [mainDomain, setMainDomain] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [wildcardBase, setWildcardBase] = useState('');
  const [recordMethod, setRecordMethod] = useState<'A' | 'CNAME'>('A');
  const [isPrimary, setIsPrimary] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [rows, setRows] = useState<DomainRecord[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const body = useMemo(() => ({ type, domain, mainDomain, subdomain, wildcardBase, recordMethod, setupMethod: 'CUSTOM_MANUAL', isPrimary }), [type, domain, mainDomain, subdomain, wildcardBase, recordMethod, isPrimary]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${id}/domains`, { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload.message || 'Domains could not be loaded.');
      setRows(Array.isArray(payload) ? payload : []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Domains could not be loaded.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const check = async () => {
    setWorking(true); setMessage('');
    try {
      const response = await fetch(`/api/projects/${id}/domains/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Domain check failed.');
      setPlan(payload.plan as Plan);
      setMessage('Domain is available. Review the DNS records, then save it.');
    } catch (error) { setPlan(null); setMessage(error instanceof Error ? error.message : 'Domain check failed.'); }
    finally { setWorking(false); }
  };

  const save = async () => {
    setWorking(true); setMessage('');
    try {
      const response = await fetch(`/api/projects/${id}/domains`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Domain save failed.');
      setPlan({ hostname: payload.domain.hostname, records: payload.records });
      setMessage('Domain saved. Create the shown DNS records, then verify.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Domain save failed.'); }
    finally { setWorking(false); }
  };

  const applyDns = async (row: DomainRecord) => {
    setMessage(`Applying DNS records for ${row.hostname}…`);
    const response = await fetch(`/api/projects/${id}/domains/${row.id}/apply-dns`, { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || 'Automatic DNS setup failed.'); return; }
    setMessage(`DNS records were applied through ${payload.provider}. Wait for propagation, then verify.`);
    await load();
  };

  const verify = async (row: DomainRecord) => {
    setMessage(`Checking DNS for ${row.hostname}…`);
    const response = await fetch(`/api/projects/${id}/domains/${row.id}/verify`, { method: 'POST' });
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.ok ? `${row.hostname} is verified and ready.` : payload.domain?.errorMessage || payload.message || 'DNS verification failed.');
    await load();
  };

  const makePrimary = async (row: DomainRecord) => {
    const response = await fetch(`/api/projects/${id}/domains/${row.id}/primary`, { method: 'PATCH' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || 'Primary domain update failed.'); return; }
    setMessage(`${row.hostname} is now the primary route.`);
    await load();
  };

  const remove = async (row: DomainRecord) => {
    if (!window.confirm(`Delete ${row.hostname}?`)) return;
    const response = await fetch(`/api/projects/${id}/domains/${row.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || 'Domain delete failed.'); return; }
    setMessage(`${row.hostname} deleted.`);
    await load();
  };

  return (
    <AppShell active="domains" title="Domain setup" description="Plan DNS records, verify ownership and select the hostname that should receive deployment traffic." backHref={`/projects/${id}`} backLabel="Project">
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Domain details</p><h2 className="panel-title">Choose the route type</h2><p className="panel-subtitle">Deploy OS validates conflicts before saving anything.</p></div></div>
            <div className="form-grid">
              <div className="field"><label>Domain type</label><select className="input" value={type} onChange={(event) => { setType(event.target.value as DomainType); setPlan(null); }}><option value="MAIN_DOMAIN">Main domain</option><option value="SUBDOMAIN">Subdomain</option><option value="WILDCARD_SUBDOMAIN">Wildcard subdomain</option><option value="SAAS_TENANT_WILDCARD">SaaS tenant wildcard</option></select></div>
              <div className="field"><label>DNS route record</label><select className="input" value={recordMethod} onChange={(event) => setRecordMethod(event.target.value as 'A' | 'CNAME')}><option value="A">A record to VPS IP</option><option value="CNAME">CNAME to Deploy OS</option></select></div>
              {type === 'MAIN_DOMAIN' ? <div className="field full"><label>Domain</label><input className="input" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" /></div> : null}
              {type === 'SUBDOMAIN' ? <><div className="field"><label>Main domain</label><input className="input" value={mainDomain} onChange={(event) => setMainDomain(event.target.value)} placeholder="example.com" /></div><div className="field"><label>Subdomain</label><input className="input" value={subdomain} onChange={(event) => setSubdomain(event.target.value)} placeholder="app" /></div></> : null}
              {type === 'WILDCARD_SUBDOMAIN' || type === 'SAAS_TENANT_WILDCARD' ? <><div className="field"><label>Main domain</label><input className="input" value={mainDomain} onChange={(event) => setMainDomain(event.target.value)} placeholder="example.com" /></div><div className="field"><label>Wildcard base</label><input className="input" value={wildcardBase} onChange={(event) => setWildcardBase(event.target.value)} placeholder="tenant" /></div></> : null}
              <label className="danger-option"><input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} /><span><strong>Use as primary project route</strong><small>The next successful deployment will route traffic to this hostname.</small></span></label>
            </div>
            <div className="inline-actions" style={{ marginTop: 16 }}><button className="btn secondary" type="button" disabled={working} onClick={check}>Check and preview</button><button className="btn" type="button" disabled={working || !plan} onClick={save}>Save domain</button></div>
            {message ? <div className="toast" style={{ marginTop: 16 }}>{message}</div> : null}
          </section>

          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">DNS preview</p><h2 className="panel-title">Records to create</h2><p className="panel-subtitle">Create both the route record and ownership TXT record at your DNS provider.</p></div><span className="badge">{plan ? plan.hostname : 'No preview'}</span></div>
            {!plan ? <div className="empty-state">Check a domain to generate its exact DNS records.</div> : <div className="table-wrap"><table className="table"><thead><tr><th>Purpose</th><th>Type</th><th>Name</th><th>Value</th><th>TTL</th></tr></thead><tbody>{plan.records.map((record) => <tr key={`${record.purpose}-${record.name}`}><td>{record.purpose}</td><td>{record.type}</td><td>{record.name}</td><td>{record.value}</td><td>{record.ttl}</td></tr>)}</tbody></table></div>}
          </section>

          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Saved domains</p><h2 className="panel-title">Verification and routing</h2></div><button className="btn secondary" type="button" onClick={load}>Refresh</button></div>
            {loading ? <div className="empty-state">Loading domains…</div> : rows.length === 0 ? <div className="empty-state">No domains saved for this project.</div> : <div className="table-wrap"><table className="table"><thead><tr><th>Hostname</th><th>DNS</th><th>Ownership</th><th>Route</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.hostname}</strong>{row.isPrimary ? <><br /><small>Primary</small></> : null}</td><td>{row.dnsStatus}</td><td>{row.ownershipStatus}</td><td>{row.routeStatus}</td><td><div className="inline-actions"><button className="btn secondary small" type="button" onClick={() => void applyDns(row)}>Apply DNS</button><button className="btn secondary small" type="button" onClick={() => void verify(row)}>Verify</button>{!row.isPrimary ? <button className="btn secondary small" type="button" onClick={() => void makePrimary(row)}>Make primary</button> : null}<button className="btn secondary small" type="button" onClick={() => void remove(row)}>Delete</button></div></td></tr>)}</tbody></table></div>}
          </section>
        </div>

        <aside className="stack summary-panel"><section className="panel"><p className="panel-kicker">Process</p><h2 className="panel-title">Domain checklist</h2><div className="flow" style={{ marginTop: 14 }}>{[['1','Preview','Validate hostname and collision rules.'],['2','Save','Store the expected A/CNAME and TXT records.'],['3','Configure DNS','Apply through Cloudflare or create both records manually.'],['4','Verify','Deploy OS resolves DNS and ownership.'],['5','Deploy','A healthy deployment switches Nginx to the new container.']].map(([number,title,text]) => <div className="step" key={number}><span className="step-no">{number}</span><p><strong>{title}</strong>{text}</p></div>)}</div></section><div className="notice"><strong>SSL:</strong> automatic Certbot issuance is controlled by RUNNER_AUTO_SSL and RUNNER_SSL_EMAIL on the VPS.</div></aside>
      </section>
    </AppShell>
  );
}
