export default function EnvPage() {
  return (
    <div className="shell">
      <aside className="sidebar"><div className="logo"><span className="logo-mark" /> TechTeam Deploy OS</div></aside>
      <main className="main">
        <div className="title" style={{ marginBottom: 18 }}>
          <h1>Environment Variables</h1>
          <p>Upload .env here. GitHub repo keeps only .env.example.</p>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Upload .env</h2>
            <input className="input" type="file" />
            <div style={{ height: 10 }} />
            <button className="btn">Parse & Encrypt</button>
          </div>
          <div className="card">
            <h2>Auto DATABASE_URL</h2>
            <pre className="code">DATABASE_URL=********
JWT_SECRET=********
NEXT_PUBLIC_SITE_URL=https://example.com</pre>
          </div>
        </div>
      </main>
    </div>
  );
}
