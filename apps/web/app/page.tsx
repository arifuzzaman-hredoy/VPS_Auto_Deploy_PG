import Link from 'next/link';
import { AppShell, MiniMetric } from './components/AppShell';

const deploymentSteps = [
  ['1', 'Create project', 'Add repository, branch, build command and runtime port.'],
  ['2', 'Connect repository', 'Generate a read-only deploy key and add it to GitHub.'],
  ['3', 'Add configuration', 'Upload environment variables and optionally create PostgreSQL.'],
  ['4', 'Add workflow', 'Copy the generated GitHub Actions YAML and repository secrets.'],
  ['5', 'Deploy', 'Push code. The runner builds, checks health and starts the app.'],
];

const projects = [
  ['Deploy OS', 'vps.techteamlead.com', 'Live', 'main'],
  ['Demo Project', 'demo.techteamlead.com', 'Ready', 'main'],
  ['DNS Sandbox', 'dns.techteamlead.com', 'Draft', 'develop'],
];

export default function HomePage() {
  return (
    <AppShell
      active="dashboard"
      title="Deployment dashboard"
      description="Create projects, connect repositories, manage secrets, provision databases and route domains from one place."
      actions={<Link className="btn" href="/projects/new">Create project</Link>}
    >
      <section className="grid grid-4" style={{ maxWidth: 1280, margin: '0 auto 20px' }}>
        <MiniMetric label="Runner" value="Online" />
        <MiniMetric label="API" value="Healthy" />
        <MiniMetric label="Managed apps" value="3" />
        <MiniMetric label="Typical deploy" value="~2 min" />
      </section>

      <section className="content-grid">
        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Deployment process</p>
                <h2 className="panel-title">How a project goes live</h2>
                <p className="panel-subtitle">Use this order every time. Each step prepares the next one.</p>
              </div>
            </div>
            <div className="flow">
              {deploymentSteps.map(([number, title, description]) => (
                <div className="step" key={number}>
                  <span className="step-no">{number}</span>
                  <p><strong>{title}</strong>{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Projects</p>
                <h2 className="panel-title">Current projects</h2>
                <p className="panel-subtitle">Project status, domain and tracked branch.</p>
              </div>
              <Link className="btn secondary" href="/projects/new">New project</Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Project</th><th>Domain</th><th>Status</th><th>Branch</th></tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project[0]}>
                      <td>{project[0]}</td>
                      <td>{project[1]}</td>
                      <td><span className="badge">{project[2]}</span></td>
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
            <p className="panel-kicker">Quick actions</p>
            <h2 className="panel-title">Common tasks</h2>
            <div className="stack" style={{ marginTop: 16 }}>
              <Link className="btn" href="/projects/new">Create a project</Link>
              <Link className="btn secondary" href="/projects/demo/env">Manage environment</Link>
              <Link className="btn secondary" href="/projects/demo/domains">Manage domains</Link>
              <Link className="btn secondary" href="/dns-providers">DNS providers</Link>
            </div>
          </div>

          <div className="panel">
            <p className="panel-kicker">Safety</p>
            <h2 className="panel-title">Default protections</h2>
            <div className="flow" style={{ marginTop: 12 }}>
              <div className="step"><span className="step-no">1</span><p><strong>Secrets stay outside Git</strong>Environment values are encrypted on the server.</p></div>
              <div className="step"><span className="step-no">2</span><p><strong>Health check before switch</strong>Failed builds are not promoted.</p></div>
              <div className="step"><span className="step-no">3</span><p><strong>DNS changes are reviewed</strong>Preview records before applying them.</p></div>
            </div>
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
