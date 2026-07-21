'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MiniMetric } from './AppShell';

type Project = {
  id: string;
  name: string;
  slug: string;
  defaultBranch: string;
  status: string;
  liveUrl?: string | null;
  primaryDomain?: string | null;
  framework?: string | null;
  deployTokenConfigured?: boolean;
  deployments: Array<{ id: string; status: string; commitSha?: string | null; createdAt: string }>;
  _count: { envVars: number; domains: number; deployments: number };
};

export function DashboardProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/projects', { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload.message || 'Projects could not be loaded.');
      setProjects(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Projects could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const liveCount = useMemo(() => projects.filter((project) => project.status === 'LIVE').length, [projects]);
  const deployingCount = useMemo(() => projects.filter((project) => ['DEPLOYING', 'BUILDING'].includes(project.status)).length, [projects]);
  const failedCount = useMemo(() => projects.filter((project) => project.status === 'DEPLOY_FAILED').length, [projects]);

  return (
    <>
      <section className="grid grid-4" style={{ maxWidth: 1280, margin: '0 auto 20px' }}>
        <MiniMetric label="Projects" value={String(projects.length)} />
        <MiniMetric label="Live" value={String(liveCount)} />
        <MiniMetric label="Deploying" value={String(deployingCount)} />
        <MiniMetric label="Needs attention" value={String(failedCount)} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Projects</p>
            <h2 className="panel-title">Current projects</h2>
            <p className="panel-subtitle">Real project, deployment and runtime status from Deploy OS.</p>
          </div>
          <div className="inline-actions">
            <button className="btn secondary" type="button" onClick={load}>Refresh</button>
            <Link className="btn" href="/projects/new">New project</Link>
          </div>
        </div>

        {message ? <div className="toast error">{message}</div> : null}
        {loading ? (
          <div className="empty-state">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="empty-state">No projects yet. Create the first project to start a CI/CD deployment.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Project</th><th>Live URL</th><th>Status</th><th>Latest deploy</th><th>Branch</th><th>Action</th></tr></thead>
              <tbody>
                {projects.map((project) => {
                  const latest = project.deployments[0];
                  return (
                    <tr key={project.id}>
                      <td><strong>{project.name}</strong><br /><small>{project.slug}{project.framework ? ` · ${project.framework}` : ''}</small></td>
                      <td>{project.liveUrl ? <a href={project.liveUrl} target="_blank" rel="noreferrer">{project.liveUrl}</a> : 'Not live'}</td>
                      <td><span className="badge">{project.status}</span></td>
                      <td>{latest ? `${latest.status}${latest.commitSha ? ` · ${latest.commitSha.slice(0, 8)}` : ''}` : 'No deployments'}</td>
                      <td>{project.defaultBranch}</td>
                      <td><Link className="btn secondary small" href={`/projects/${project.id}`}>Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
