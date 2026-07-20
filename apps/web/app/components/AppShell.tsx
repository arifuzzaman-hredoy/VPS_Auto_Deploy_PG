import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

type NavItem = {
  href: string;
  label: string;
  hint: string;
};

type AppShellProps = {
  active: 'dashboard' | 'new-project' | 'domains' | 'environment' | 'dns';
  eyebrow?: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', hint: 'Overview' },
  { href: '/projects/new', label: 'New Project', hint: 'Setup and deploy' },
  { href: '/projects/demo/domains', label: 'Domains', hint: 'DNS and SSL' },
  { href: '/projects/demo/env', label: 'Environment', hint: 'Secrets' },
  { href: '/dns-providers', label: 'DNS Providers', hint: 'Credentials' },
];

const activeMap: Record<AppShellProps['active'], string> = {
  dashboard: '/',
  'new-project': '/projects/new',
  domains: '/projects/demo/domains',
  environment: '/projects/demo/env',
  dns: '/dns-providers',
};

export function AppShell({
  active,
  eyebrow = 'Hredoy Deploy OS',
  title,
  description,
  backHref,
  backLabel = 'Back',
  actions,
  children,
}: AppShellProps) {
  const activeHref = activeMap[active];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="brand-block" aria-label="Open dashboard">
          <span className="brand-mark" aria-hidden="true">
            <DevOpsLogo />
          </span>
          <span className="brand-copy">
            <strong>Hredoy Deploy OS</strong>
            <small>VPS control panel</small>
          </span>
        </Link>

        <ThemeToggle />

        <nav className="side-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={item.href === activeHref ? 'active' : undefined}>
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </Link>
          ))}
        </nav>

        <div className="sidebar-note" aria-label="Runner status">
          <span className="status-dot" />
          <div>
            <strong>Runner connected</strong>
            <p>GitHub push → build → health check → live.</p>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="page-hero">
          <div>
            {backHref ? (
              <Link href={backHref} className="back-link">
                ← {backLabel}
              </Link>
            ) : null}
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="hero-description">{description}</p>
          </div>
          {actions ? <div className="hero-actions">{actions}</div> : null}
        </header>

        {children}
      </main>
    </div>
  );
}

function DevOpsLogo() {
  return (
    <svg viewBox="0 0 128 64" role="img" aria-label="DevOps infinity logo">
      <defs>
        <marker id="devops-arrow-left" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0 0 7 3.5 0 7Z" className="devops-logo-primary-fill" />
        </marker>
        <marker id="devops-arrow-right" markerWidth="7" markerHeight="7" refX="5.2" refY="3.5" orient="auto">
          <path d="M0 0 7 3.5 0 7Z" className="devops-logo-secondary-fill" />
        </marker>
      </defs>
      <path
        d="M61 25C51 12 42 7 28 7 14 7 6 17 6 32s8 25 22 25c16 0 25-12 36-27"
        className="devops-logo-primary-stroke"
        markerEnd="url(#devops-arrow-left)"
      />
      <path
        d="M67 39c10 13 19 18 33 18 14 0 22-10 22-25S114 7 100 7C84 7 75 19 64 34"
        className="devops-logo-secondary-stroke"
        markerEnd="url(#devops-arrow-right)"
      />
      <circle cx="64" cy="32" r="4" className="devops-logo-node" />
    </svg>
  );
}

export function MiniMetric({ label, value }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' }) {
  return (
    <div className="mini-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
