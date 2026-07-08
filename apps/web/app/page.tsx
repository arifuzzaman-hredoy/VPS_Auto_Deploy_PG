import Link from 'next/link';
import { AppShell, MiniMetric } from './components/AppShell';

const deployFlow = [
  ['01', 'Create project', 'Repo URL, slug, branch and runtime commands are registered.'],
  ['02', 'Add deploy key', 'Read-only public key is added to the client GitHub repo.'],
  ['03', 'Upload env', 'Secrets are stored encrypted and injected only at deploy/runtime.'],
  ['04', 'Provision database', 'Project PostgreSQL DB/user/DATABASE_URL can be generated.'],
  ['05', 'Push to GitHub', 'GitHub Actions calls Deploy OS API and the VPS runner builds.'],
  ['06', 'Health + switch', 'New app is promoted only after health check passes.'],
];

const activeProjects = [
  ['Deploy OS', 'https://vps.techteamlead.com', 'Live', 'Self-hosted runner'],
  ['Demo Project', 'demo.techteamlead.com', 'Ready', 'Template data'],
  ['DNS Sandbox', 'dns.techteamlead.com', 'Draft', 'Provider setup'],
];

export default function HomePage() {
  return (
    <AppShell
      active="dashboard"
      title="VPS Deployment Control Center"
      description="GitHub push থেকে auto deploy, .env safe storage, database provision, DNS + SSL routing — সব workflow এক dashboard থেকে clear ভাবে manage করার জন্য."
      actions={
        <>
          <Link className="btn secondary" href="/dns-providers">DNS Providers</Link>
          <Link className="btn" href="/projects/new">+ New Project</Link>
        </>
      }
    >
      <section className="grid grid-4" style={{ marginBottom: 18 }}>
        <MiniMetric label="GitHub Runner" value="Online" tone="good" />
        <MiniMetric label="Deploy API" value="Healthy" tone="good" />
        <MiniMetric label="PM2 Apps" value="3 Live" tone="good" />
        <MiniMetric label="Normal Deploy Time" value="~2m" />
      </section>

      <section className="layout-2-rail">
        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Workflow</p>
                <h2 className="panel-title">How a project goes live</h2>
                <p className="panel-subtitle">এই flow follow করলে কোন step missing থাকবে না। User/client কে deploy দেওয়ার সময় একই process use করবা।</p>
              </div>
              <span className="badge">Production path</span>
            </div>
            <div className="flow">
              {deployFlow.map(([no, title, text]) => (
                <div className="step" key={no}>
                  <span className="step-no">{no}</span>
                  <p><strong>{title}</strong>{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Projects</p>
                <h2 className="panel-title">Current project list preview</h2>
                <p className="panel-subtitle">Backend project list connect করার আগে UI table ready রাখা হয়েছে।</p>
              </div>
              <Link className="btn ghost" href="/projects/new">Create another</Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Project</th><th>URL</th><th>Status</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {activeProjects.map((project) => (
                    <tr key={project[0]}>
                      <td>{project[0]}</td>
                      <td>{project[1]}</td>
                      <td><span className={project[2] === 'Live' ? 'badge' : 'badge gray'}>{project[2]}</span></td>
                      <td>{project[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <p className="panel-kicker">Quick Actions</p>
            <h2 className="panel-title">Start from here</h2>
            <p className="panel-subtitle">সবচেয়ে common কাজগুলো short path এ রাখা হয়েছে।</p>
            <div className="stack" style={{ marginTop: 16 }}>
              <Link className="btn" href="/projects/new">Create project wizard</Link>
              <Link className="btn secondary" href="/projects/demo/env">Manage environment</Link>
              <Link className="btn secondary" href="/projects/demo/domains">Add domain / SSL</Link>
              <Link className="btn ghost" href="/dns-providers">Connect DNS provider</Link>
            </div>
          </div>

          <div className="panel">
            <p className="panel-kicker">Safety Rules</p>
            <h2 className="panel-title">Deploy guardrails</h2>
            <div className="flow" style={{ marginTop: 14 }}>
              <div className="step"><span className="step-no">✓</span><p><strong>No secrets in repo</strong>.env stays encrypted inside Deploy OS.</p></div>
              <div className="step"><span className="step-no">✓</span><p><strong>Health check first</strong>New app is promoted only when it is responding.</p></div>
              <div className="step"><span className="step-no">✓</span><p><strong>DNS verification</strong>Custom domain needs TXT ownership verification.</p></div>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
