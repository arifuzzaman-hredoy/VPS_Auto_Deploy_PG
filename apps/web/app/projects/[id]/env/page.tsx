'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';

type EnvRow = { id: string; key: string; environment: string; isSecret: boolean; isSystemManaged: boolean; updatedAt: string };

function parseEnv(content: string) {
  const variables: Record<string, string> = {};
  const errors: string[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const source = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const separator = source.indexOf('=');
    if (separator < 1) { errors.push(`Line ${index + 1}: missing = sign`); return; }
    const key = source.slice(0, separator).trim();
    let value = source.slice(separator + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) { errors.push(`Line ${index + 1}: invalid key ${key}`); return; }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    variables[key] = value;
  });
  return { variables, errors };
}

export default function EnvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${id}/env`, { cache: 'no-store' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload.message || 'Environment variables could not be loaded.');
      setRows(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Environment variables could not be loaded.');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    const parsed = parseEnv(await file.text());
    setFileName(file.name);
    setVariables(parsed.variables);
    setErrors(parsed.errors);
    setMessage(parsed.errors.length ? 'Fix the parsing errors before saving.' : `${Object.keys(parsed.variables).length} key(s) parsed and ready to save.`);
  };

  const save = async () => {
    if (!fileName || errors.length) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${id}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: 'production', variables, replace: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Environment save failed.');
      setMessage(`${payload.count ?? Object.keys(variables).length} production key(s) encrypted and saved.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Environment save failed.'); }
    finally { setSaving(false); }
  };

  const remove = async (row: EnvRow) => {
    if (!window.confirm(`Delete ${row.key}?`)) return;
    const response = await fetch(`/api/projects/${id}/env/${row.id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || 'Delete failed.'); return; }
    setMessage(`${row.key} deleted.`);
    await load();
  };

  return (
    <AppShell active="environment" title="Environment variables" description="Upload and manage encrypted production configuration for this project." backHref={`/projects/${id}`} backLabel="Project">
      <section className="content-grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Import</p><h2 className="panel-title">Upload environment file</h2><p className="panel-subtitle">Uploading again replaces previous non-system production keys. Values never appear after save.</p></div></div>
            <label className="upload-box">
              <input type="file" accept=".env,.txt" onChange={(event) => void chooseFile(event.target.files?.[0])} />
              <strong>{fileName || 'Choose .env file'}</strong>
              <small>{fileName ? `${Object.keys(variables).length} keys parsed` : '.env and .txt files are accepted'}</small>
            </label>
            {errors.length ? <div className="toast error" style={{ marginTop: 16 }}>{errors.map((error) => <div key={error}>{error}</div>)}</div> : null}
            {message ? <div className={`toast ${errors.length ? 'error' : 'success'}`} style={{ marginTop: 16 }}>{message}</div> : null}
            <div className="inline-actions" style={{ marginTop: 16 }}><button className="btn" type="button" disabled={!fileName || Boolean(errors.length) || saving} onClick={save}>{saving ? 'Saving…' : 'Encrypt and save'}</button><button className="btn secondary" type="button" onClick={load}>Refresh</button></div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><p className="panel-kicker">Stored configuration</p><h2 className="panel-title">Environment keys</h2><p className="panel-subtitle">Only key names and metadata are displayed.</p></div><span className="badge">{rows.length} keys</span></div>
            {loading ? <div className="empty-state">Loading keys…</div> : rows.length === 0 ? <div className="empty-state">No environment variables are stored.</div> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>Key</th><th>Environment</th><th>Visibility</th><th>Source</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.key}</strong></td><td>{row.environment}</td><td>{row.isSecret ? 'Secret' : 'Public build value'}</td><td>{row.isSystemManaged ? 'System managed' : 'Uploaded file'}</td><td>{row.isSystemManaged ? 'Managed automatically' : <button className="btn secondary small" type="button" onClick={() => void remove(row)}>Delete</button>}</td></tr>)}</tbody></table></div>
            )}
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel"><p className="panel-kicker">Process</p><h2 className="panel-title">How configuration reaches the app</h2><div className="flow" style={{ marginTop: 14 }}>{[['1','Parse','Validate every key before sending.'],['2','Encrypt','Store every value with AES-GCM.'],['3','Build','Mount values as a Docker BuildKit secret.'],['4','Run','Inject values through Docker --env-file.']].map(([number,title,text]) => <div className="step" key={number}><span className="step-no">{number}</span><p><strong>{title}</strong>{text}</p></div>)}</div></section>
          <div className="notice"><strong>Database URL:</strong> when Deploy OS provisions PostgreSQL, DATABASE_URL is created as a system-managed key.</div>
        </aside>
      </section>
    </AppShell>
  );
}
