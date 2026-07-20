import { AppShell } from '../components/AppShell';

const providers = [
  ['Cloudflare', 'Zone token with DNS edit scope'],
  ['Namecheap', 'API user, key and whitelisted VPS IP'],
  ['DigitalOcean DNS', 'Personal access token'],
  ['AWS Route53', 'Scoped IAM access key'],
  ['GoDaddy', 'API key and secret'],
  ['cPanel / WHM', 'Zone editor or WHM API token'],
  ['Custom provider', 'Adapter implementation'],
];

const safetySteps = [
  ['1', 'Save credential', 'Encrypt provider credentials in Deploy OS.'],
  ['2', 'Test connection', 'Verify account access without changing DNS.'],
  ['3', 'Preview changes', 'Show the exact records that would be created.'],
  ['4', 'Dry run', 'Validate provider response and permissions.'],
  ['5', 'Confirm apply', 'Require an explicit final confirmation.'],
];

export default function DnsProvidersPage() {
  return (
    <AppShell
      active="dns"
      title="DNS providers"
      description="Connect provider credentials, test access and review record changes before applying them."
      backHref="/"
      backLabel="Dashboard"
      actions={<button className="btn">Add provider</button>}
    >
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">1</span>
                <div>
                  <p className="panel-kicker">Connection</p>
                  <h2 className="panel-title">Provider credentials</h2>
                  <p className="panel-subtitle">Limit each credential to the smallest required zone and permission scope.</p>
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Provider</label>
                <select className="input" defaultValue="cloudflare">
                  <option value="cloudflare">Cloudflare</option>
                  <option value="namecheap">Namecheap</option>
                  <option value="digitalocean">DigitalOcean DNS</option>
                  <option value="route53">AWS Route53</option>
                  <option value="custom">Custom provider</option>
                </select>
              </div>
              <div className="field">
                <label>Connection label</label>
                <input className="input" placeholder="Client Cloudflare account" />
              </div>
              <div className="field full">
                <label>Allowed zone</label>
                <input className="input" placeholder="example.com" />
                <small>This connection should not modify any other zone.</small>
              </div>
              <div className="field full">
                <label>Credential JSON</label>
                <textarea className="textarea" placeholder='{"apiToken":"********"}' />
                <small>The value is encrypted before it is stored.</small>
              </div>
            </div>

            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button className="btn">Save provider</button>
              <button className="btn secondary">Test connection</button>
              <button className="btn secondary">Run dry test</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">2</span>
                <div>
                  <p className="panel-kicker">Supported integrations</p>
                  <h2 className="panel-title">Provider requirements</h2>
                  <p className="panel-subtitle">Choose the provider that manages the project domain.</p>
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Provider</th><th>Required access</th></tr></thead>
                <tbody>
                  {providers.map(([name, requirement]) => <tr key={name}><td>{name}</td><td>{requirement}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel">
            <p className="panel-kicker">Safe write process</p>
            <h2 className="panel-title">Before changing DNS</h2>
            <div className="flow" style={{ marginTop: 14 }}>
              {safetySteps.map(([number, title, text]) => (
                <div className="step" key={number}><span className="step-no">{number}</span><p><strong>{title}</strong>{text}</p></div>
              ))}
            </div>
          </section>
          <div className="notice"><strong>Rule:</strong> The apply action stays disabled until connection test and dry run both pass.</div>
        </aside>
      </section>
    </AppShell>
  );
}
