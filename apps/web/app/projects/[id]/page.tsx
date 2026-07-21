'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ProjectCiCdPanel } from '../../components/ProjectCiCdPanel';

type DeploymentLog = { id: string; level: string; message: string; createdAt: string };
type Deployment = {
  id: string;
  status: string;
  branch: string;
  commitSha?: string | null;
  hostPort?: number | null;
  routeHostname?: string | null;
  createdAt: string;
  liveAt?: string | null;
  finishedAt?: string | null;
  logs: DeploymentLog[];
};
type Project = {
  id: string;
  name: string;
  slug: string;
  repoUrl?: string | null;
  repositoryFullName?: string | null;
  defaultBranch: string;
  rootDirectory: string;
  installCommand?: string | null;
  buildCommand: string;
  startCommand: string;
  appPort: number;
  healthPath: string;
  primaryDomain?: string | null;
  framework?: string | null;
  status: string;
  liveUrl?: string | null;
  deployTokenConfigured: boolean;
  deployments: Deployment[];
  domains: Array<{ id: string; hostname: string; status: string; isPrimary: boolean }>;
  databases: Array<{ id: string; databaseName: string; status: string }>;
  _count: { envVars: number; deployKeys: number; deployments: number; domains: number };
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setMessage('');
    try {
      const response = await fetch(`/api/projects/${id}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Project could not be loaded.');
      setProject(payload as Project);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const activeStatuses = new Set(['QUEUED', 'CREATED', 'REPO_CLONED', 'FRAMEWORK_DETECTED', 'BUILDING_IMAGE', 'DATABASE_MIGRATION', 'STARTING_CONTAINER', 'HEALTH_CHECKING', 'UPDATING_PROXY']);
    const shouldPoll = project?.status === 'DEPLOYING' || project?.status === 'BUILDING' || project?.deployments.some((deployment) => activeStatuses.has(deployment.status));
    if (!shouldPoll) return;
    const timer = window.setInterval(() => { void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [load, project]);

  const readiness = useMemo(() => {
    if (!project) return [];
    return [
      ['Repository connected', Boolean(project.repositoryFullName)],
      ['Deploy key created', project._count.deployKeys > 0],
      ['CI/CD token created', project.deployTokenConfigured],
      ['Runtime configured', Boolean(project.appPort && project.healthPath)],
      ['Environment optional', true],
      ['Database optional', true],
    ] as Array<[string, boolean]>;
  }, [project]);

  return (
    <AppShell
      active="dashboard"
      title={project?.name || 'Project'}
      description="Review setup readiness, CI/CD configuration and deployment history."
      backHref="/"
      backLabel="Dashboard"
      actions={project ? <div className="inline-actions"><button className="btn secondary" type="button" onClick={() => void load()}>Refresh</button>{project.liveUrl ? <a className="btn" href={project.liveUrl} target="_blank" rel="noreferrer">Open live app</a> : null}</div> : undefined}
    >
      {message ? <div className="toast error">{message}</div> : null}
      {loading ? <div className="empty-state">Loading project…</div> : !project ? null : (
        <section className="content-grid">
          <div className="stack">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Project configuration</p>
                  <h2 className="panel-title">Source and runtime</h2>
                </div>
                <span className="badge">{project.status}</span>
              </div>
              <div className="review-list">
                <Review label="Repository" value={project.repoUrl || 'Not set'} />
                <Review label="Branch" value={project.defaultBranch} />
                <Review label="Root directory" value={project.rootDirectory || "."} />
                <Review label="Framework" value={project.framework || 'Auto detect on first deploy'} />
                <Review label="Install" value={project.installCommand || 'Auto detect'} />
                <Review label="Build" value={project.buildCommand || "Auto detect"} />
                <Review label="Start" value={project.startCommand || "Auto detect"} />
                <Review label="Port" value={String(project.appPort)} />
                <Review label="Health path" value={project.healthPath} />
                <Review label="Primary domain" value={project.primaryDomain || 'Optional'} />
                <Review label="Live URL" value={project.liveUrl || 'Not live yet'} />
              </div>
              <div className="inline-actions" style={{ marginTop: 16 }}>
                <Link className="btn secondary" href={`/projects/${project.id}/env`}>Environment</Link>
                <Link className="btn secondary" href={`/projects/${project.id}/domains`}>Domains</Link>
                <Link className="btn secondary" href="/projects/new">Create another project</Link>
              </div>
            </section>

            <ProjectCiCdPanel
              projectId={project.id}
              branch={project.defaultBranch}
              repositoryFullName={project.repositoryFullName}
              deployTokenConfigured={project.deployTokenConfigured}
            />

            <section className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Deployment history</p>
                  <h2 className="panel-title">GitHub Actions deployments</h2>
                  <p className="panel-subtitle">The newest deployment is shown first. Expand a row to view runner logs.</p>
                </div>
                <span className="badge">{project._count.deployments} total</span>
              </div>
              {project.deployments.length === 0 ? <div className="empty-state">No deployment has been triggered yet. Add the workflow and push to {project.defaultBranch}.</div> : (
                <div className="stack">
                  {project.deployments.map((deployment) => (
                    <details className="details-box" key={deployment.id}>
                      <summary>{deployment.status} · {deployment.commitSha?.slice(0, 12) || 'manual'} · {formatDate(deployment.createdAt)}</summary>
                      <div className="details-content stack">
                        <div className="review-list">
                          <Review label="Branch" value={deployment.branch} />
                          <Review label="Container port" value={deployment.hostPort ? String(deployment.hostPort) : 'Not assigned'} />
                          <Review label="Route" value={deployment.routeHostname || 'Not assigned'} />
                          <Review label="Finished" value={formatDate(deployment.finishedAt)} />
                        </div>
                        <pre className="code tall">{deployment.logs.map((log) => `[${log.level}] ${log.message}`).join('\n') || 'No logs yet.'}</pre>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="stack summary-panel">
            <section className="panel">
              <p className="panel-kicker">Readiness</p>
              <h2 className="panel-title">CI/CD checklist</h2>
              <div className="checklist" style={{ marginTop: 14 }}>
                {readiness.map(([label, done]) => <div key={label} className={`check-row ${done ? 'done' : ''}`}><span className="check-icon">{done ? '✓' : ''}</span><span>{label}</span></div>)}
              </div>
            </section>
            <section className="panel">
              <p className="panel-kicker">Stored configuration</p>
              <h2 className="panel-title">Project data</h2>
              <div className="review-list" style={{ marginTop: 14 }}>
                <Review label="Environment keys" value={String(project._count.envVars)} />
                <Review label="Deploy keys" value={String(project._count.deployKeys)} />
                <Review label="Database" value={project.databases[0]?.databaseName || 'Skipped'} />
                <Review label="Domains" value={String(project._count.domains)} />
                <Review label="CI/CD token" value={project.deployTokenConfigured ? 'Configured' : 'Missing'} />
              </div>
            </section>
          </aside>
        </section>
      )}
    </AppShell>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="review-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}
