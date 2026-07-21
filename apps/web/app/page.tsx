import Link from 'next/link';
import { AppShell } from './components/AppShell';
import { DashboardProjects } from './components/DashboardProjects';

const deploymentSteps = [
  ['1', 'Create project', 'Add the GitHub repository and runtime settings.'],
  ['2', 'Connect repository', 'Add the generated read-only deploy key to GitHub.'],
  ['3', 'Save configuration', 'Upload environment variables and optionally create PostgreSQL.'],
  ['4', 'Enable CI/CD', 'Add the generated workflow and two GitHub repository secrets.'],
  ['5', 'Push code', 'The runner clones the exact commit, builds in Docker, migrates, checks health and switches traffic.'],
];

export default function HomePage() {
  return (
    <AppShell
      active="dashboard"
      title="Deployment dashboard"
      description="Create projects, connect GitHub Actions and deploy isolated Docker applications to your VPS."
      actions={<Link className="btn" href="/projects/new">Create project</Link>}
    >
      <DashboardProjects />

      <section className="content-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Deployment process</p>
              <h2 className="panel-title">How a project goes live</h2>
              <p className="panel-subtitle">Follow the same five-step process for every repository.</p>
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

        <aside className="stack">
          <div className="panel">
            <p className="panel-kicker">Operations</p>
            <h2 className="panel-title">System sections</h2>
            <div className="stack" style={{ marginTop: 16 }}>
              <Link className="btn secondary" href="/database">Database records</Link>
              <Link className="btn secondary" href="/logs">System logs</Link>
              <Link className="btn secondary" href="/dns-providers">DNS providers</Link>
            </div>
          </div>
          <div className="notice">
            <strong>Zero-downtime rule:</strong> the previous container remains live until the new container passes its health check and the route is switched.
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
