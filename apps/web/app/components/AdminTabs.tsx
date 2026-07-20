import Link from 'next/link';

type AdminTabsProps = {
  active: 'database' | 'logs';
};

export function AdminTabs({ active }: AdminTabsProps) {
  return (
    <nav className="admin-section-tabs" aria-label="Data administration">
      <Link href="/database" className={active === 'database' ? 'active' : undefined}>
        <span>Database</span>
        <small>Saved records and direct management</small>
      </Link>
      <Link href="/logs" className={active === 'logs' ? 'active' : undefined}>
        <span>Logs</span>
        <small>Activity, deployment and error history</small>
      </Link>
    </nav>
  );
}
