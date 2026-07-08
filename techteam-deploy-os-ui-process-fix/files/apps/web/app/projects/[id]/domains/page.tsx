import { AppShell } from '../../../components/AppShell';

const records = [
  ['Main domain', 'A', '@', '198.54.121.88', 'Root domain points directly to VPS IP.'],
  ['Subdomain', 'CNAME', 'app', 'vps.techteamlead.com', 'Subdomain points to Deploy OS proxy.'],
  ['Wildcard', 'CNAME', '*.app', 'vps.techteamlead.com', 'Tenant wildcard route for SaaS apps.'],
  ['Ownership', 'TXT', '_deployos.app', 'deployos-verify=project_xxxxx', 'Proof that domain belongs to client.'],
];

const checks = [
  ['1', 'Format check', 'Reject invalid hostname and wildcard pattern.'],
  ['2', 'Duplicate check', 'Prevent two projects from claiming same hostname.'],
  ['3', 'Record preview', 'Show A/CNAME/TXT records before applying DNS.'],
  ['4', 'TXT ownership', 'Verify client controls the domain.'],
  ['5', 'SSL issue', 'Enable HTTPS only after DNS is pointed.'],
  ['6', 'Route live', 'Proxy traffic to healthy app container/PM2 port.'],
];

export default function DomainsPage() {
  return (
    <AppShell
      active="domains"
      title="Domain Manager"
      description="Main domain, subdomain, wildcard domain, DNS ownership verification and SSL route — step-by-step clear flow."
      backHref="/"
      backLabel="Back to Dashboard"
      actions={<button className="btn">Add Domain</button>}
    >
      <section className="layout-2-rail">
        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Domain Input</p>
                <h2 className="panel-title">Add a new domain</h2>
                <p className="panel-subtitle">প্রথমে type select করো, তারপর domain দিয়ে check করো। DNS change apply করার আগে preview দেখাবে।</p>
              </div>
              <span className="badge gray">Dry run first</span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>DNS setup method</label>
                <select className="input" defaultValue="API_AUTO">
                  <option value="API_AUTO">Provider API auto</option>
                  <option value="CUSTOM_MANUAL">Manual DNS record</option>
                  <option value="MANAGED_NAMESERVER">Managed nameserver</option>
                </select>
                <small>API auto হলে provider credential আগে add করতে হবে।</small>
              </div>
              <div className="field">
                <label>Domain type</label>
                <select className="input" defaultValue="SUBDOMAIN">
                  <option value="MAIN_DOMAIN">Main domain</option>
                  <option value="SUBDOMAIN">Subdomain</option>
                  <option value="WILDCARD_SUBDOMAIN">Wildcard subdomain</option>
                  <option value="SAAS_TENANT_WILDCARD">SaaS tenant wildcard</option>
                </select>
                <small>Wildcard route for multi-tenant apps.</small>
              </div>
              <div className="field full">
                <label>Hostname</label>
                <input className="input" placeholder="example.com / app.example.com / *.tenant.example.com" />
                <small>Do not include https:// or path.</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn">Check Domain</button>
              <button className="btn secondary">Preview DNS Records</button>
              <button className="btn ghost">Verify TXT</button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">DNS Plan</p>
                <h2 className="panel-title">Record preview</h2>
                <p className="panel-subtitle">Client/server দুই দিকেই same plan follow করবে।</p>
              </div>
              <span className="badge warn">Pending DNS</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Use</th><th>Type</th><th>Name</th><th>Value</th><th>Why</th></tr></thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.join('-')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <p className="panel-kicker">Status</p>
            <h2 className="panel-title">Domain flow checklist</h2>
            <div className="flow" style={{ marginTop: 16 }}>
              {checks.map(([no, title, text]) => (
                <div className="step" key={no}>
                  <span className="step-no">{no}</span>
                  <p><strong>{title}</strong>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="notice">
            <strong>Important:</strong> DNS auto-write করার আগে always dry-run দেখাও। Wrong DNS write করলে live client site down হতে পারে।
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
