import Link from 'next/link';
import { Activity, Database, GitBranch, Globe2, KeyRound, Lock, Rocket, Server, Workflow } from 'lucide-react';

const stats = [
  ['Projects', '12'],
  ['Live Domains', '27'],
  ['Deployments', '183'],
  ['Failures Saved', '41']
];

const flow = [
  'GitHub repo connect + deploy key generate',
  'YAML detect from .github/workflows/deploy.yml',
  '.env upload + encrypted secret storage',
  'VPS PostgreSQL database auto provision',
  'Framework detect + Docker build',
  'Health check + proxy switch + rollback safety',
  'Domain/subdomain/wildcard DNS + SSL',
  'Future GitHub push triggers auto deployment'
];

export default function HomePage() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo"><span className="logo-mark" /> TechTeam Deploy OS</div>
        <nav className="nav">
          <Link className="active" href="/">Dashboard</Link>
          <Link href="/projects/new">New Project</Link>
          <Link href="/projects/demo/domains">Domains</Link>
          <Link href="/projects/demo/env">Environment</Link>
          <Link href="/dns-providers">DNS Providers</Link>
        </nav>
      </aside>
      <main className="main">
        <div className="header">
          <div className="title">
            <h1>Self-hosted VPS deployment platform</h1>
            <p>GitHub push থেকে auto deploy, .env safe storage, database provision, DNS + SSL routing.</p>
          </div>
          <Link className="btn" href="/projects/new"><Rocket size={18} />&nbsp; New Project</Link>
        </div>

        <section className="grid grid-3" style={{ marginBottom: 14 }}>
          {stats.map(([label, value]) => (
            <div className="card" key={label}>
              <div className="stat">{value}</div>
              <p>{label}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-2" style={{ marginBottom: 14 }}>
          <div className="card">
            <h2><Workflow size={20} /> Deployment Workflow</h2>
            <div className="flow">
              {flow.map((item, index) => (
                <div className="step" key={item}>
                  <span className="step-no">{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2><Lock size={20} /> Security-first Rules</h2>
            <div className="flow">
              {[
                ['Docker sandbox', 'Unknown project code never runs directly on host.'],
                ['Encrypted secrets', '.env, deploy key, DNS API key stored encrypted.'],
                ['Rollback safety', 'Old app stays live until new health check passes.'],
                ['DNS verification', 'No custom domain route before TXT ownership check.']
              ].map(([title, desc], index) => (
                <div className="step" key={title}>
                  <span className="step-no">{index + 1}</span>
                  <p><strong>{title}</strong><br />{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-3">
          <Feature icon={<GitBranch />} title="GitHub CI/CD" text="Actions YAML only triggers Deploy OS API; runner pulls code and deploys inside VPS." />
          <Feature icon={<Database />} title="Auto Database" text="Project-level PostgreSQL DB/user/password + DATABASE_URL injection." />
          <Feature icon={<Globe2 />} title="Domain DNS" text="Main domain, subdomain, wildcard, provider API, TXT ownership, SSL." />
          <Feature icon={<KeyRound />} title="Deploy Key" text="Read-only public key goes to GitHub; private key stays encrypted server-side." />
          <Feature icon={<Server />} title="Runner Agent" text="Queue worker builds Docker image, starts container, checks health, switches route." />
          <Feature icon={<Activity />} title="Live Logs" text="Build logs, runtime logs, failed states and audit logs for every action." />
        </section>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="card"><div className="badge">{icon} {title}</div><p style={{ marginTop: 10 }}>{text}</p></div>;
}
