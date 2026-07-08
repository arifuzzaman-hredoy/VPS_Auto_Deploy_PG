export default function NewProjectPage() {
  return (
    <div className="shell">
      <aside className="sidebar"><div className="logo"><span className="logo-mark" /> TechTeam Deploy OS</div></aside>
      <main className="main">
        <div className="title" style={{ marginBottom: 18 }}>
          <h1>Create Project</h1>
          <p>Repo connect, deploy key, .env, database and domain workflow in one compact setup.</p>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Project Source</h2>
            <div className="form-row">
              <input className="input" placeholder="Project name" />
              <input className="input" placeholder="project-slug" />
            </div>
            <div style={{ height: 10 }} />
            <input className="input" placeholder="GitHub repo URL" />
            <div style={{ height: 10 }} />
            <button className="btn">Generate Deploy Key</button>
          </div>
          <div className="card">
            <h2>Generated GitHub Actions YAML</h2>
            <pre className="code">{`DEPLOY_API_URL=https://deploy.yourdomain.com
DEPLOY_TOKEN=dep_live_xxxxxxxxx

.github/workflows/deploy.yml will trigger:
POST /api/deployments/trigger`}</pre>
          </div>
          <div className="card">
            <h2>Database Setup</h2>
            <div className="form-row">
              <input className="input" placeholder="database_name" />
              <input className="input" placeholder="database_user" />
            </div>
            <div style={{ height: 10 }} />
            <input className="input" placeholder="strong database password" type="password" />
          </div>
          <div className="card">
            <h2>.env Upload</h2>
            <input className="input" type="file" />
            <p style={{ marginTop: 10 }}>Secrets are encrypted and injected only during build/runtime.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
