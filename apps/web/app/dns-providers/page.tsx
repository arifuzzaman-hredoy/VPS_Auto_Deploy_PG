import { AppShell } from '../components/AppShell';

const providers = [
  ['Cloudflare', 'Recommended', 'Zone token, DNS edit permission'],
  ['Namecheap', 'Popular', 'API user, key, whitelisted VPS IP'],
  ['DigitalOcean DNS', 'Simple', 'Personal access token'],
  ['AWS Route53', 'Enterprise', 'IAM access key with hosted zone scope'],
  ['GoDaddy', 'Common', 'API key and secret'],
  ['Hostinger', 'Manual/API', 'Provider support depends on account'],
  ['cPanel / WHM', 'Hosting', 'Zone editor or WHM API token'],
  ['Custom Provider', 'Adapter', 'Use provider adapter interface'],
];

const dryRun = `1. Save encrypted provider credential
2. Test API connection
3. Preview record changes
4. Dry-run without writing DNS
5. Confirm write
6. Verify TXT + SSL`;

export default function DnsProvidersPage() {
  return (
    <AppShell
      active="dns"
      title="DNS Providers"
      description="Provider API credential, dry-run, DNS record preview and safe apply workflow. ভুল DNS write থেকে client site protect করার জন্য confirmation flow রাখা হয়েছে।"
      backHref="/"
      backLabel="Back to Dashboard"
      actions={<button className="btn">Add Provider</button>}
    >
      <section className="layout-2-rail">
        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Provider Setup</p>
                <h2 className="panel-title">Connect a DNS provider</h2>
                <p className="panel-subtitle">Credential save করার আগে provider select করো। Production এ credential encrypted storage এ যাবে।</p>
              </div>
              <span className="badge gray">Encrypted</span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Provider</label>
                <select className="input" defaultValue="cloudflare">
                  <option value="cloudflare">Cloudflare</option>
                  <option value="namecheap">Namecheap</option>
                  <option value="digitalocean">DigitalOcean DNS</option>
                  <option value="route53">AWS Route53</option>
                  <option value="custom">Custom Provider</option>
                </select>
                <small>Provider specific adapter later add করা যাবে।</small>
              </div>
              <div className="field">
                <label>Provider name</label>
                <input className="input" placeholder="Client Cloudflare Account" />
                <small>Internal label for team members.</small>
              </div>
              <div className="field full">
                <label>Allowed zone</label>
                <input className="input" placeholder="example.com" />
                <small>Credential should only touch this zone.</small>
              </div>
              <div className="field full">
                <label>Credential JSON</label>
                <textarea className="textarea" placeholder='{"apiToken":"********"}' />
                <small>Never paste this into GitHub. Store only inside Deploy OS.</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn">Save Provider</button>
              <button className="btn secondary">Test Connection</button>
              <button className="btn ghost">Dry Run</button>
            </div>
          </div>

          <div className="grid grid-2">
            {providers.map(([name, tag, description]) => (
              <div className="card" key={name}>
                <div className="panel-header" style={{ marginBottom: 8 }}>
                  <h3>{name}</h3>
                  <span className={tag === 'Recommended' ? 'badge' : 'badge gray'}>{tag}</span>
                </div>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <p className="panel-kicker">Safety</p>
            <h2 className="panel-title">DNS write flow</h2>
            <pre className="code" style={{ marginTop: 14 }}>{dryRun}</pre>
          </div>
          <div className="notice"><strong>Rule:</strong> Auto DNS write করার আগে record preview + dry-run pass না করলে confirm button active হবে না।</div>
        </aside>
      </section>
    </AppShell>
  );
}
