import { AppShell } from '../../../components/AppShell';

const records = [
  ['Main domain', 'A', '@', '198.54.121.88', 'Points the root domain to the VPS.'],
  ['Subdomain', 'CNAME', 'app', 'vps.techteamlead.com', 'Routes a subdomain through Deploy OS.'],
  ['Wildcard', 'CNAME', '*.app', 'vps.techteamlead.com', 'Supports tenant or wildcard routing.'],
  ['Ownership', 'TXT', '_deployos.app', 'deployos-verify=project_xxxxx', 'Confirms domain ownership.'],
];

const checks = [
  ['1', 'Validate hostname', 'Reject invalid hostnames and unsupported wildcard patterns.'],
  ['2', 'Check ownership', 'Make sure another project is not already using the hostname.'],
  ['3', 'Preview DNS', 'Review A, CNAME and TXT records before applying changes.'],
  ['4', 'Verify TXT record', 'Confirm the client controls the domain.'],
  ['5', 'Issue SSL', 'Enable HTTPS only after DNS resolves correctly.'],
  ['6', 'Activate route', 'Send traffic to the healthy application port.'],
];

export default function DomainsPage() {
  return (
    <AppShell
      active="domains"
      title="Domain setup"
      description="Add a hostname, review the DNS records, verify ownership and activate HTTPS in a clear order."
      backHref="/"
      backLabel="Dashboard"
      actions={<button className="btn">Add domain</button>}
    >
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">1</span>
                <div>
                  <p className="panel-kicker">Domain details</p>
                  <h2 className="panel-title">Choose how the domain will be connected</h2>
                  <p className="panel-subtitle">Enter only the hostname. Do not include protocol, path or query parameters.</p>
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>DNS setup method</label>
                <select className="input" defaultValue="API_AUTO">
                  <option value="API_AUTO">Provider API</option>
                  <option value="CUSTOM_MANUAL">Manual DNS records</option>
                  <option value="MANAGED_NAMESERVER">Managed nameserver</option>
                </select>
                <small>Use provider API only when credentials are already connected.</small>
              </div>
              <div className="field">
                <label>Domain type</label>
                <select className="input" defaultValue="SUBDOMAIN">
                  <option value="MAIN_DOMAIN">Main domain</option>
                  <option value="SUBDOMAIN">Subdomain</option>
                  <option value="WILDCARD_SUBDOMAIN">Wildcard subdomain</option>
                  <option value="SAAS_TENANT_WILDCARD">SaaS tenant wildcard</option>
                </select>
                <small>Select the route pattern required by the application.</small>
              </div>
              <div className="field full">
                <label>Hostname</label>
                <input className="input" placeholder="app.example.com" />
                <small>Examples: example.com, app.example.com, *.tenant.example.com</small>
              </div>
            </div>

            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button className="btn">Check domain</button>
              <button className="btn secondary">Preview records</button>
              <button className="btn secondary">Verify ownership</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">2</span>
                <div>
                  <p className="panel-kicker">DNS preview</p>
                  <h2 className="panel-title">Records to create</h2>
                  <p className="panel-subtitle">Review this table before any provider API writes are made.</p>
                </div>
              </div>
              <span className="badge">Not applied</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Purpose</th><th>Type</th><th>Name</th><th>Value</th><th>Reason</th></tr></thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row.join('-')}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel">
            <p className="panel-kicker">Process</p>
            <h2 className="panel-title">Domain checklist</h2>
            <div className="flow" style={{ marginTop: 14 }}>
              {checks.map(([number, title, text]) => (
                <div className="step" key={number}>
                  <span className="step-no">{number}</span>
                  <p><strong>{title}</strong>{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="notice">
            <strong>Safe default:</strong> Always preview and verify DNS changes before applying them to a live client domain.
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
