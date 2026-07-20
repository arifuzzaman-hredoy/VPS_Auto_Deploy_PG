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
          <span>
            <strong>Hredoy Deploy OS</strong>
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

function DevOpsLogo() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="DevOps logo">
      <path
        d="M9.5 24c0-6.2 4.1-10.5 9.3-10.5 4.9 0 7.3 3.2 10.2 7.1 2.6 3.5 4.3 5.9 7.1 5.9 2 0 3.4-1.2 3.4-2.5s-1.4-2.5-3.4-2.5c-2.8 0-4.5 2.4-7.1 5.9-2.9 3.9-5.3 7.1-10.2 7.1-5.2 0-9.3-4.3-9.3-10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="24" r="2.5" fill="currentColor" />
      <circle cx="38.5" cy="24" r="2.5" fill="currentColor" />
      <path d="M20 8h8M24 4v8M20 40h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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
