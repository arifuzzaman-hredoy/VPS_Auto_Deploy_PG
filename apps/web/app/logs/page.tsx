'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminAccessGate } from '../components/AdminAccessGate';
import { AdminTabs } from '../components/AdminTabs';
import { AppShell } from '../components/AppShell';

type LogType = 'all' | 'activity' | 'deployments' | 'errors' | 'data';

type LogRow = {
  id: string;
  source: string;
  category: string;
  projectId?: string | null;
  projectName?: string | null;
  level: string;
  title: string;
  message: string;
  statusCode?: number | null;
  createdAt: string;
  details: Record<string, unknown>;
};

type LogResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
  projects: Array<{ id: string; name: string; slug: string }>;
  counts: Record<LogType, number>;
  logs: LogRow[];
};

const initialData: LogResponse = {
  total: 0,
  page: 1,
  pageSize: 30,
  totalPages: 1,
  categories: [],
  projects: [],
  counts: { all: 0, activity: 0, deployments: 0, errors: 0, data: 0 },
  logs: [],
};

const logTabs: Array<{ key: LogType; label: string }> = [
  { key: 'all', label: 'All activity' },
  { key: 'activity', label: 'User and API actions' },
  { key: 'deployments', label: 'Deployment logs' },
  { key: 'errors', label: 'Errors' },
  { key: 'data', label: 'Data changes' },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function LogsPage() {
  return (
    <AppShell
      active="logs"
      title="System logs"
      description="Track API actions, data changes, deployment output and failures with category and project filters."
      backHref="/"
      backLabel="Dashboard"
    >
      <AdminTabs active="logs" />
      <AdminAccessGate>
        {({ token, lock, handleUnauthorized }) => (
          <LogsWorkspace token={token} lock={lock} onUnauthorized={handleUnauthorized} />
        )}
      </AdminAccessGate>
    </AppShell>
  );
}

function LogsWorkspace({ token, lock, onUnauthorized }: { token: string; lock: () => void; onUnauthorized: () => void }) {
  const [type, setType] = useState<LogType>('all');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LogResponse>(initialData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const headers = useMemo(() => ({ 'x-deploy-os-admin-token': token }), [token]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const params = new URLSearchParams({ type, page: String(page), pageSize: '30' });
    if (projectId) params.set('projectId', projectId);
    if (category) params.set('category', category);
    if (search.trim()) params.set('search', search.trim());

    try {
      const response = await fetch(`/api/admin/logs?${params.toString()}`, { headers });
      if (response.status === 401) {
        onUnauthorized();
        throw new Error('Admin session expired.');
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Logs could not be loaded.');
      setData(payload as LogResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Logs could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [category, headers, onUnauthorized, page, projectId, search, type]);

  useEffect(() => {
    const timer = window.setTimeout(loadLogs, 250);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  const chooseType = (nextType: LogType) => {
    setType(nextType);
    setPage(1);
  };

  return (
    <section className="panel admin-data-panel">
      <div className="log-type-tabs" role="tablist" aria-label="Log types">
        {logTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={type === tab.key ? 'active' : undefined}
            onClick={() => chooseType(tab.key)}
          >
            <span>{tab.label}</span>
            <small>{data.counts[tab.key] ?? 0}</small>
          </button>
        ))}
      </div>

      <div className="admin-filter-row logs-filter-row">
        <div className="field admin-search-field">
          <label htmlFor="logs-search">Search logs</label>
          <input
            id="logs-search"
            className="input"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Action, message, request ID, commit…"
          />
        </div>
        <div className="field">
          <label htmlFor="logs-project">Project</label>
          <select id="logs-project" className="input" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }}>
            <option value="">All projects</option>
            {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.slug})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="logs-category">Category</label>
          <select id="logs-category" className="input" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {data.categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="inline-actions logs-actions">
          <button className="btn secondary" type="button" onClick={loadLogs}>Refresh</button>
          <button className="btn secondary" type="button" onClick={lock}>Lock</button>
        </div>
      </div>

      <div className="panel-header compact">
        <div>
          <p className="panel-kicker">History</p>
          <h2 className="panel-title">{logTabs.find((tab) => tab.key === type)?.label}</h2>
          <p className="panel-subtitle">{data.total} matching log entr{data.total === 1 ? 'y' : 'ies'}.</p>
        </div>
      </div>

      {message ? <div className="toast error">{message}</div> : null}

      {loading ? (
        <div className="empty-state">Loading logs…</div>
      ) : data.logs.length === 0 ? (
        <div className="empty-state">No logs match the current filters.</div>
      ) : (
        <div className="table-wrap logs-table-wrap">
          <table className="table logs-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Category</th>
                <th>Project</th>
                <th>Event</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td><span className="badge">{log.category}</span></td>
                  <td>{log.projectName || 'System'}</td>
                  <td>
                    <details className="record-details log-details">
                      <summary>
                        <strong>{log.title}</strong>
                        <small>{log.message}</small>
                      </summary>
                      <dl>
                        <div><dt>Source</dt><dd>{log.source}</dd></div>
                        <div><dt>Level</dt><dd>{log.level}</dd></div>
                        <div><dt>Log ID</dt><dd>{log.id}</dd></div>
                        {Object.entries(log.details).map(([key, value]) => (
                          <div key={`${log.id}-${key}`}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</dd></div>
                        ))}
                      </dl>
                    </details>
                  </td>
                  <td>
                    <span className={`status-label ${log.level.toLowerCase() === 'error' || (log.statusCode ?? 0) >= 400 ? 'error' : 'ok'}`}>
                      {log.statusCode ? `HTTP ${log.statusCode}` : log.level}
                    </span>
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
  );
}
