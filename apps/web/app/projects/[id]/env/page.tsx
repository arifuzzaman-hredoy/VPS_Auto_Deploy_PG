import { AppShell } from '../../../components/AppShell';

const envRows = [
  ['DATABASE_URL', 'Secret', 'Database provisioner'],
  ['JWT_SECRET', 'Secret', 'Uploaded file'],
  ['NEXT_PUBLIC_SITE_URL', 'Public', 'Uploaded file'],
  ['ADMIN_EMAIL', 'Secret', 'Uploaded file'],
];

const process = [
  ['1', 'Upload', 'Choose a .env or text file.'],
  ['2', 'Validate', 'Reject invalid keys before saving anything.'],
  ['3', 'Encrypt', 'Store secret values encrypted on the server.'],
  ['4', 'Inject', 'Provide variables only during build and runtime.'],
];

export default function EnvPage() {
  return (
    <AppShell
      active="environment"
      title="Environment variables"
      description="Upload, review and store runtime configuration without exposing secret values in GitHub."
      backHref="/"
      backLabel="Dashboard"
      actions={<button className="btn">Upload file</button>}
    >
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">1</span>
                <div>
                  <p className="panel-kicker">Import</p>
                  <h2 className="panel-title">Upload environment file</h2>
                  <p className="panel-subtitle">Only key names are shown. Secret values remain hidden after parsing.</p>
                </div>
              </div>
            </div>

            <label className="upload-box">
              <input type="file" accept=".env,.txt" />
              <strong>Choose .env file</strong>
              <small>.env and .txt files are accepted</small>
            </label>

            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button className="btn">Parse and save</button>
              <button className="btn secondary">Generate DATABASE_URL</button>
              <button className="btn secondary">Download .env.example</button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">2</span>
                <div>
                  <p className="panel-kicker">Stored configuration</p>
                  <h2 className="panel-title">Environment keys</h2>
                  <p className="panel-subtitle">This table describes each key without displaying its value.</p>
                </div>
              </div>
              <span className="badge">4 keys</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Key</th><th>Visibility</th><th>Source</th></tr></thead>
                <tbody>
                  {envRows.map((row) => (
                    <tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel">
            <p className="panel-kicker">Process</p>
            <h2 className="panel-title">How secrets are handled</h2>
            <div className="flow" style={{ marginTop: 14 }}>
              {process.map(([number, title, text]) => (
                <div className="step" key={number}><span className="step-no">{number}</span><p><strong>{title}</strong>{text}</p></div>
              ))}
            </div>
          </section>
          <div className="notice"><strong>Repository rule:</strong> Commit only .env.example. Real environment values stay in Deploy OS.</div>
        </aside>
      </section>
    </AppShell>
  );
}
