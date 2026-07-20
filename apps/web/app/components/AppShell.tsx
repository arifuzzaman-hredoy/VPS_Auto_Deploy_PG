import Link from 'next/link';
import type { ReactNode } from 'react';

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
  eyebrow = 'TechTeam Deploy OS',
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
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>TechTeam Deploy OS</strong>
            <small>VPS control panel</small>
          </span>
        </Link>

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

export function MiniMetric({ label, value }: { label: string; value: string; tone?: 'default' | 'good' | 'warning' }) {
  return (
    <div className="mini-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
