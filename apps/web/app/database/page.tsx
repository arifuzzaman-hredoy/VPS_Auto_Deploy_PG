'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTabs } from '../components/AdminTabs';
import { AppShell } from '../components/AppShell';

type EntityKey =
  | 'projects'
  | 'users'
  | 'deployKeys'
  | 'workflowFiles'
  | 'environmentVariables'
  | 'projectDatabases'
  | 'deployments'
  | 'deploymentLogs'
  | 'domains'
  | 'dnsProviders'
  | 'auditLogs';

type Overview = {
  totalRecords: number;
  highlights: {
    projects: number;
    deployments: number;
    projectDatabases: number;
    logs: number;
  };
  projects: Array<{ id: string; name: string; slug: string }>;
  categories: Array<{
    key: string;
    label: string;
    description: string;
    count: number;
    entities: Array<{ key: EntityKey; label: string; count: number }>;
  }>;
};

type DatabaseRecord = {
  id: string;
  entity: EntityKey;
  title: string;
  subtitle: string;
  projectId?: string | null;
  projectName?: string | null;
  status?: string | null;
  createdAt?: string | null;
  fields: Array<{ label: string; value: string }>;
};

type RecordResponse = {
  entity: EntityKey;
  label: string;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  records: DatabaseRecord[];
};

type DeleteTarget = DatabaseRecord | null;

const initialOverview: Overview = {
  totalRecords: 0,
  highlights: { projects: 0, deployments: 0, projectDatabases: 0, logs: 0 },
  projects: [],
  categories: [],
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function DatabasePage() {
  return (
    <AppShell
      active="database"
      title="Database records"
      description="Review every record saved by Hredoy Deploy OS, filter by category or project, and remove unwanted data with confirmation."
      backHref="/"
      backLabel="Dashboard"
    >
      <AdminTabs active="database" />
      <DatabaseWorkspace />
    </AppShell>
  );
}

function DatabaseWorkspace() {
  const [overview, setOverview] = useState<Overview>(initialOverview);
  const [categoryKey, setCategoryKey] = useState('projects');
  const [entity, setEntity] = useState<EntityKey>('projects');
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecordResponse>({
    entity: 'projects',
    label: 'Projects',
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    records: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteText, setDeleteText] = useState('');
  const [dropPhysicalDatabase, setDropPhysicalDatabase] = useState(false);
  const [deleting, setDeleting] = useState(false);


  const loadOverview = useCallback(async () => {
    const response = await fetch('/api/admin/database/overview');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Database overview failed.');
    setOverview(payload as Overview);
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({ entity, page: String(page), pageSize: '25' });
    if (projectId) params.set('projectId', projectId);
    if (search.trim()) params.set('search', search.trim());

    try {
      const response = await fetch(`/api/admin/database/records?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Database records failed.');
      setData(payload as RecordResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Database records failed.');
    } finally {
      setLoading(false);
    }
  }, [entity, page, projectId, search]);

  useEffect(() => {
    loadOverview().catch((error) => setMessage(error instanceof Error ? error.message : 'Database overview failed.'));
  }, [loadOverview]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRecords();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  const activeCategory = overview.categories.find((category) => category.key === categoryKey) ?? overview.categories[0];

  const chooseCategory = (nextKey: string) => {
    const category = overview.categories.find((item) => item.key === nextKey);
    if (!category) return;
    setCategoryKey(nextKey);
    setEntity(category.entities[0]?.key ?? 'projects');
    setPage(1);
  };

  const chooseEntity = (nextEntity: EntityKey) => {
    setEntity(nextEntity);
    setPage(1);
  };

  const refresh = async () => {
    setMessage('');
    try {
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Refresh failed.');
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget || deleteText !== 'DELETE') return;
    setDeleting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/database/records/${deleteTarget.entity}/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE', dropPhysicalDatabase }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Delete failed.');
      setMessage(typeof payload.note === 'string' ? payload.note : 'Record deleted successfully.');
      setDeleteTarget(null);
      setDeleteText('');
      setDropPhysicalDatabase(false);
      await Promise.all([loadOverview(), loadRecords()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const canDropPhysical = deleteTarget?.entity === 'projectDatabases' || deleteTarget?.entity === 'projects' || deleteTarget?.entity === 'users';

  return (
    <>
      <section className="admin-toolbar panel">
        <div className="admin-metrics">
          <div><strong>{overview.totalRecords}</strong><span>Total records</span></div>
          <div><strong>{overview.highlights.projects}</strong><span>Projects</span></div>
          <div><strong>{overview.highlights.deployments}</strong><span>Deployments</span></div>
          <div><strong>{overview.highlights.projectDatabases}</strong><span>Databases</span></div>
          <div><strong>{overview.highlights.logs}</strong><span>Log entries</span></div>
        </div>
        <div className="inline-actions">
          <button className="btn secondary" type="button" onClick={refresh}>Refresh</button>
        </div>
      </section>

      <section className="panel admin-data-panel">
        <div className="admin-category-tabs" role="tablist" aria-label="Database categories">
          {overview.categories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={category.key === categoryKey ? 'active' : undefined}
              onClick={() => chooseCategory(category.key)}
            >
              <span>{category.label}</span>
              <small>{category.count} records</small>
            </button>
          ))}
        </div>

        {activeCategory ? (
          <div className="entity-tabs" aria-label={`${activeCategory.label} tables`}>
            {activeCategory.entities.map((item) => (
              <button
                type="button"
                key={item.key}
                className={entity === item.key ? 'active' : undefined}
                onClick={() => chooseEntity(item.key)}
              >
                {item.label} <span>{item.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="admin-filter-row">
          <div className="field admin-search-field">
            <label htmlFor="database-search">Search records</label>
            <input
              id="database-search"
              className="input"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Name, ID, status, domain, repository…"
            />
          </div>
          <div className="field">
            <label htmlFor="database-project">Project</label>
            <select
              id="database-project"
              className="input"
              value={projectId}
              onChange={(event) => { setProjectId(event.target.value); setPage(1); }}
            >
              <option value="">All projects</option>
              {overview.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name} ({project.slug})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="panel-header compact">
          <div>
            <p className="panel-kicker">Selected table</p>
            <h2 className="panel-title">{data.label}</h2>
            <p className="panel-subtitle">{data.total} matching record{data.total === 1 ? '' : 's'}. Secret values are never displayed.</p>
          </div>
        </div>

        {message ? <div className="toast">{message}</div> : null}

        {loading ? (
          <div className="empty-state">Loading database records…</div>
        ) : data.records.length === 0 ? (
          <div className="empty-state">No records match the current filters.</div>
        ) : (
          <div className="table-wrap admin-record-table-wrap">
            <table className="table admin-record-table">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <details className="record-details">
                        <summary>
                          <strong>{record.title}</strong>
                          <small>{record.subtitle}</small>
                        </summary>
                        <dl>
                          <div><dt>ID</dt><dd>{record.id}</dd></div>
                          {record.fields.map((item) => (
                            <div key={`${record.id}-${item.label}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                          ))}
                        </dl>
                      </details>
                    </td>
                    <td>{record.projectName || '—'}</td>
                    <td><span className="badge">{record.status || 'Saved'}</span></td>
                    <td>{formatDate(record.createdAt)}</td>
                    <td>
                      <button className="btn danger small" type="button" onClick={() => {
                        setDeleteTarget(record);
                        setDeleteText('');
                        setDropPhysicalDatabase(false);
                      }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pagination-row">
          <button className="btn secondary small" type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span>Page {data.page} of {data.totalPages}</span>
          <button className="btn secondary small" type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </section>

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="panel-kicker">Destructive action</p>
            <h2 id="delete-title" className="panel-title">Delete {deleteTarget.title}?</h2>
            <p className="panel-subtitle">
              This removes the selected record directly from the Deploy OS database. Related records may also be removed by database cascade rules.
            </p>

            {canDropPhysical ? (
              <label className="danger-option">
                <input
                  type="checkbox"
                  checked={dropPhysicalDatabase}
                  onChange={(event) => setDropPhysicalDatabase(event.target.checked)}
                />
                <span>
                  <strong>Also remove tracked physical PostgreSQL database and role</strong>
                  <small>Use this only when the client database should be permanently destroyed.</small>
                </span>
              </label>
            ) : null}

            <div className="field">
              <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
              <input
                id="delete-confirmation"
                className="input"
                value={deleteText}
                onChange={(event) => setDeleteText(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="inline-actions modal-actions">
              <button className="btn secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn danger" type="button" disabled={deleteText !== 'DELETE' || deleting} onClick={deleteRecord}>
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
