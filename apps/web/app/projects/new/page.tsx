"use client";

import { useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";

type ProjectForm = {
  name: string;
  slug: string;
  repoUrl: string;
  branch: string;
  domain: string;
  buildCommand: string;
  startCommand: string;
  appPort: string;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  envFileName: string;
};

type SaveStatus = {
  type: "idle" | "success" | "error" | "loading";
  message: string;
  projectId?: string;
};

type DeployKeyStatus = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
  publicKey: string;
  fingerprint: string;
};

const initialForm: ProjectForm = {
  name: "",
  slug: "",
  repoUrl: "",
  branch: "main",
  domain: "",
  buildCommand: "npm run build",
  startCommand: "npm run start",
  appPort: "3000",
  databaseName: "",
  databaseUser: "",
  databasePassword: "",
  envFileName: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseEnv(content: string) {
  const variables: Record<string, string> = {};
  const errors: string[] = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      errors.push(`Line ${index + 1}: missing = sign`);
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!/^[A-Z0-9_]+$/.test(key)) {
      errors.push(`Line ${index + 1}: invalid key ${key}`);
      return;
    }

    variables[key] = value;
  });

  return { variables, errors };
}

function mask(value: string) {
  if (!value) return "Not set";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

export default function NewProjectPage() {
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [projectId, setProjectId] = useState("");
  const [deployKeyStatus, setDeployKeyStatus] = useState<DeployKeyStatus>({
    type: "idle",
    message: "",
    publicKey: "",
    fingerprint: "",
  });
  const [copiedTarget, setCopiedTarget] = useState<string>("");
  const [envVariables, setEnvVariables] = useState<Record<string, string>>({});
  const [envErrors, setEnvErrors] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: "idle", message: "" });
  const [databaseProvisioned, setDatabaseProvisioned] = useState(false);

  const deployToken = useMemo(() => {
    const seed = form.slug || "project-slug";
    return `dep_live_${seed}_replace_with_generated_secret`;
  }, [form.slug]);

  const yaml = useMemo(() => {
    return `name: Deploy with TechTeam Deploy OS

on:
  push:
    branches:
      - ${form.branch || "main"}
  workflow_dispatch:

permissions:
  contents: read

jobs:
  trigger-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Trigger TechTeam Deploy OS
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          curl -fsSL -X POST "$DEPLOY_API_URL/api/deployments/trigger" \\
            -H "Authorization: Bearer $DEPLOY_TOKEN" \\
            -H "Content-Type: application/json" \\
            -d '{
              "repository": "\${{ github.repository }}",
              "branch": "\${{ github.ref_name }}",
              "commit": "\${{ github.sha }}",
              "runId": "\${{ github.run_id }}"
            }'`;
  }, [form.branch]);

  const deployKeyGenerated = deployKeyStatus.type === "success" && Boolean(deployKeyStatus.publicKey);

  const databaseReady = Boolean(
    form.databaseName.trim() &&
      form.databaseUser.trim() &&
      form.databasePassword.trim().length >= 12,
  );

  const completionItems = [
    { label: "Project identity", done: Boolean(form.name.trim() && form.slug.trim()) },
    { label: "GitHub repo URL", done: Boolean(form.repoUrl.trim()) },
    { label: "Deploy key step", done: deployKeyGenerated },
    { label: "Build config", done: Boolean(form.buildCommand.trim() && form.startCommand.trim() && form.appPort.trim()) },
    { label: "Database optional", done: databaseProvisioned || (!form.databaseName && !form.databaseUser && !form.databasePassword) },
    { label: ".env parsed", done: Boolean(form.envFileName && envErrors.length === 0) },
    { label: "Generated YAML", done: Boolean(yaml) },
  ];

  const completedCount = completionItems.filter((item) => item.done).length;
  const progress = Math.round((completedCount / completionItems.length) * 100);

  const updateForm = (key: keyof ProjectForm, value: string) => {
    if (key === "databaseName" || key === "databaseUser" || key === "databasePassword") {
      setDatabaseProvisioned(false);
    }

    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && !current.slug ? { slug: slugify(value) } : {}),
    }));
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(label);
      window.setTimeout(() => setCopiedTarget(""), 1500);
    } catch {
      setSaveStatus({ type: "error", message: "Clipboard permission blocked by browser." });
    }
  };

  const handleEnvFile = async (file?: File) => {
    if (!file) return;
    const content = await file.text();
    const parsed = parseEnv(content);
    updateForm("envFileName", file.name);
    setEnvVariables(parsed.variables);
    setEnvErrors(parsed.errors);
  };

  const projectPayload = () => ({
    name: form.name.trim(),
    slug: form.slug.trim(),
    repoUrl: form.repoUrl.trim(),
    defaultBranch: form.branch.trim() || "main",
  });

  const validateProjectIdentity = () => {
    if (!form.name.trim()) return "Project name is required before generating a deploy key.";
    if (!form.slug.trim()) return "Project slug is required before generating a deploy key.";
    if (!/^[a-z0-9-]+$/.test(form.slug)) return "Slug can contain only lowercase letters, numbers and hyphen.";
    if (!form.repoUrl.trim()) return "GitHub repo URL is required before generating a deploy key.";
    try {
      new URL(form.repoUrl.trim());
    } catch {
      return "Enter a valid GitHub repository URL.";
    }
    return "";
  };

  const parseApiPayload = async (response: Response) => {
    const text = await response.text();
    if (!text) return {} as Record<string, unknown>;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { message: text } as Record<string, unknown>;
    }
  };

  const ensureProject = async () => {
    const identityError = validateProjectIdentity();
    if (identityError) throw new Error(identityError);

    const response = await fetch(projectId ? `/api/projects/${projectId}` : "/api/projects", {
      method: projectId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectPayload()),
    });
    const payload = await parseApiPayload(response);
    if (!response.ok) {
      throw new Error(typeof payload.message === "string" ? payload.message : "Project save failed.");
    }

    const resolvedProjectId = String(payload.id || projectId || "");
    if (!resolvedProjectId) throw new Error("Project API did not return a project ID.");
    setProjectId(resolvedProjectId);
    return resolvedProjectId;
  };

  const requestDeployKey = async (resolvedProjectId: string) => {
    const response = await fetch(`/api/projects/${resolvedProjectId}/deploy-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({}),
    });
    const payload = await parseApiPayload(response);
    if (!response.ok) {
      throw new Error(typeof payload.message === "string" ? payload.message : "Deploy key generation failed.");
    }

    const publicKey = typeof payload.publicKey === "string" ? payload.publicKey : "";
    const fingerprint = typeof payload.fingerprint === "string" ? payload.fingerprint : "";
    if (!publicKey.startsWith("ssh-ed25519 ")) {
      throw new Error("Deploy OS returned an invalid public key.");
    }

    const reused = payload.reused === true;
    setDeployKeyStatus({
      type: "success",
      publicKey,
      fingerprint,
      message: reused
        ? "Existing active deploy key loaded securely."
        : "Real Ed25519 deploy key generated. The encrypted private key is stored only on Deploy OS.",
    });
    return { publicKey, fingerprint, reused };
  };

  const generateDeployKey = async () => {
    setDeployKeyStatus({ type: "loading", message: "Saving project draft and generating a real Ed25519 key...", publicKey: "", fingerprint: "" });
    try {
      const resolvedProjectId = await ensureProject();
      await requestDeployKey(resolvedProjectId);
      setSaveStatus({
        type: "success",
        projectId: resolvedProjectId,
        message: "Project draft saved. Add the generated public key to GitHub → Settings → Deploy keys.",
      });
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Deploy key generation failed.";
      setDeployKeyStatus({ type: "error", message, publicKey: "", fingerprint: "" });
      setSaveStatus({ type: "error", message });
    }
  };

  const validateBeforeSave = () => {
    if (!form.name.trim()) return "Project name is required.";
    if (!form.slug.trim()) return "Project slug is required.";
    if (!/^[a-z0-9-]+$/.test(form.slug)) return "Slug can contain only lowercase letters, numbers and hyphen.";
    if (!form.repoUrl.trim()) return "GitHub repo URL is required.";
    if (form.databasePassword && form.databasePassword.length < 12) return "Database password must be at least 12 characters.";
    if (envErrors.length > 0) return "Fix .env parsing errors before save.";
    return "";
  };

  const saveProject = async () => {
    const error = validateBeforeSave();
    if (error) {
      setSaveStatus({ type: "error", message: error });
      return;
    }

    setSaveStatus({ type: "loading", message: "Creating project and saving optional setup..." });

    try {
      const resolvedProjectId = await ensureProject();
      const followUps: string[] = [projectId ? "project updated" : "project saved"];

      if (!deployKeyGenerated) {
        await requestDeployKey(resolvedProjectId);
        followUps.push("real Ed25519 deploy key generated");
      }

      if (Object.keys(envVariables).length > 0) {
        const envResponse = await fetch(`/api/projects/${resolvedProjectId}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environment: "production", variables: envVariables }),
        });
        if (!envResponse.ok) throw new Error("Project saved, but .env save failed.");
        followUps.push(`${Object.keys(envVariables).length} env variables encrypted`);
      }

      if (databaseReady) {
        setDatabaseProvisioned(false);

        const databaseResponse = await fetch(`/api/projects/${resolvedProjectId}/database/provision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            databaseName: form.databaseName.trim(),
            username: form.databaseUser.trim(),
            password: form.databasePassword,
            migrationMode: "MIGRATE_DEPLOY",
          }),
        });
        const databasePayload = await parseApiPayload(databaseResponse);
        if (!databaseResponse.ok) {
          const databaseMessage =
            typeof databasePayload.message === "string"
              ? databasePayload.message
              : "Project/env saved, but database provisioning failed.";
          throw new Error(databaseMessage);
        }

        setDatabaseProvisioned(true);
        followUps.push(
          databasePayload.reused === true
            ? "existing database credentials refreshed"
            : "database provisioned",
        );
      }

      setSaveStatus({
        type: "success",
        projectId: resolvedProjectId,
        message: `Success: ${followUps.join(" + ")}. Next: add the public key and workflow YAML to the client repo.`,
      });
    } catch (caughtError) {
      setSaveStatus({
        type: "error",
        message: caughtError instanceof Error ? caughtError.message : "Something went wrong.",
      });
    }
  };

  return (
    <AppShell
      active="new-project"
      title="Create a project"
      description="Complete the setup from top to bottom. Required information comes first; optional configuration is clearly separated."
      backHref="/"
      backLabel="Dashboard"
      actions={
        <>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setForm(initialForm);
              setProjectId("");
              setDeployKeyStatus({ type: "idle", message: "", publicKey: "", fingerprint: "" });
              setEnvVariables({});
              setEnvErrors([]);
              setDatabaseProvisioned(false);
              setSaveStatus({ type: "idle", message: "" });
            }}
          >
            Reset
          </button>
          <button className="btn" type="button" onClick={saveProject} disabled={saveStatus.type === "loading"}>
            {saveStatus.type === "loading" ? "Saving…" : "Save project"}
          </button>
        </>
      }
    >
      <div className="process-strip" aria-label="Project setup steps">
        {[
          ["1", "Source", "Project and repository"],
          ["2", "Runtime", "Commands and deploy key"],
          ["3", "Environment", "Secrets and database"],
          ["4", "Workflow", "GitHub Actions"],
          ["5", "Review", "Validate and save"],
        ].map(([number, title, text], index) => (
          <div key={number} className={`process-item ${completedCount > index ? "done" : ""}`}>
            <span>{number}</span>
            <strong>{title}</strong>
            <small>{text}</small>
          </div>
        ))}
      </div>

      <section className="content-grid">
        <div className="stack">
          <section className="panel" aria-labelledby="project-source-title">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">1</span>
                <div>
                  <p className="panel-kicker">Required</p>
                  <h2 className="panel-title" id="project-source-title">Project source</h2>
                  <p className="panel-subtitle">Identify the project and the GitHub repository that will be deployed.</p>
                </div>
              </div>
              <span className="badge">Required</span>
            </div>

            <div className="form-grid">
              <Field label="Project name" hint="A readable name, for example School ERP">
                <input className="input" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="School ERP" />
              </Field>
              <Field label="Project slug" hint="Used internally in URLs and deployment names">
                <input className="input" value={form.slug} onChange={(event) => updateForm("slug", slugify(event.target.value))} placeholder="school-erp" />
              </Field>
              <Field label="GitHub repository URL" hint="Public or private repository" full>
                <input className="input" value={form.repoUrl} onChange={(event) => updateForm("repoUrl", event.target.value)} placeholder="https://github.com/owner/repository.git" />
              </Field>
              <Field label="Default branch" hint="The branch that triggers production deploys">
                <input className="input" value={form.branch} onChange={(event) => updateForm("branch", event.target.value)} placeholder="main" />
              </Field>
              <Field label="Primary domain" hint="Optional. You can add it later">
                <input className="input" value={form.domain} onChange={(event) => updateForm("domain", event.target.value)} placeholder="app.example.com" />
              </Field>
            </div>
          </section>

          <section className="panel" aria-labelledby="runtime-title">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">2</span>
                <div>
                  <p className="panel-kicker">Required</p>
                  <h2 className="panel-title" id="runtime-title">Runtime and repository access</h2>
                  <p className="panel-subtitle">Set the build commands, then generate a read-only deploy key for the repository.</p>
                </div>
              </div>
              <span className="badge">{deployKeyGenerated ? "Key ready" : "Key required"}</span>
            </div>

            <div className="form-grid three">
              <Field label="Build command" hint="Runs before the app starts">
                <input className="input" value={form.buildCommand} onChange={(event) => updateForm("buildCommand", event.target.value)} />
              </Field>
              <Field label="Start command" hint="Runs the production process">
                <input className="input" value={form.startCommand} onChange={(event) => updateForm("startCommand", event.target.value)} />
              </Field>
              <Field label="Application port" hint="The local port used by the app">
                <input className="input" inputMode="numeric" value={form.appPort} onChange={(event) => updateForm("appPort", event.target.value)} />
              </Field>
            </div>

            <div className="stack" style={{ marginTop: 18 }}>
              <div className="notice">
                <strong>Deploy key:</strong> Deploy OS stores the private key encrypted on the server. Only the public key is shown here for GitHub.
              </div>

              <div className="inline-actions">
                <button
                  className="btn"
                  type="button"
                  onClick={generateDeployKey}
                  disabled={deployKeyStatus.type === "loading" || saveStatus.type === "loading"}
                >
                  {deployKeyStatus.type === "loading"
                    ? "Generating key…"
                    : deployKeyGenerated
                      ? "Load active key"
                      : "Generate deploy key"}
                </button>
                {projectId ? <span className="badge">Draft: {projectId.slice(0, 10)}…</span> : null}
              </div>

              {deployKeyStatus.message ? (
                <div className={`toast ${deployKeyStatus.type === "success" ? "success" : deployKeyStatus.type === "error" ? "error" : ""}`}>
                  {deployKeyStatus.message}
                </div>
              ) : null}

              {deployKeyGenerated ? (
                <div className="stack">
                  <div className="field">
                    <label>Public deploy key</label>
                    <pre className="code" style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{deployKeyStatus.publicKey}</pre>
                  </div>
                  <div className="review-list">
                    <ReviewRow label="Fingerprint" value={deployKeyStatus.fingerprint || "Unavailable"} />
                    <ReviewRow label="Private key" value="Encrypted on server" />
                  </div>
                  <div className="inline-actions">
                    <button className="btn secondary" type="button" onClick={() => copyText("key", deployKeyStatus.publicKey)}>
                      {copiedTarget === "key" ? "Copied" : "Copy public key"}
                    </button>
                  </div>
                  <div className="notice">
                    Add the key in GitHub → Repository settings → Deploy keys. Keep <strong>Allow write access</strong> disabled.
                  </div>
                </div>
              ) : (
                <div className="empty-state">Complete the project source section, then generate the deploy key.</div>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="environment-title">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">3</span>
                <div>
                  <p className="panel-kicker">Configuration</p>
                  <h2 className="panel-title" id="environment-title">Environment and database</h2>
                  <p className="panel-subtitle">Secrets and database settings are separate so you can use either one independently.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="stack">
                <div>
                  <h3 style={{ margin: 0 }}>Environment variables</h3>
                  <p className="panel-subtitle">Upload a .env file. Values remain hidden in the interface.</p>
                </div>
                <label className="upload-box">
                  <input type="file" accept=".env,.txt" onChange={(event) => handleEnvFile(event.target.files?.[0])} />
                  <strong>{form.envFileName || "Choose .env file"}</strong>
                  <small>{form.envFileName ? `${Object.keys(envVariables).length} keys parsed` : ".env or .txt"}</small>
                </label>
                {envErrors.length ? (
                  <div className="toast error">{envErrors.map((error) => <div key={error}>{error}</div>)}</div>
                ) : form.envFileName ? (
                  <div className="toast success">Parsed keys: {Object.keys(envVariables).join(", ") || "No variables found"}</div>
                ) : null}
              </div>

              <div className="stack">
                <div>
                  <h3 style={{ margin: 0 }}>PostgreSQL database</h3>
                  <p className="panel-subtitle">Optional. Leave every field empty to skip provisioning.</p>
                </div>
                <Field label="Database name">
                  <input className="input" value={form.databaseName} onChange={(event) => updateForm("databaseName", event.target.value)} placeholder="project_database" />
                </Field>
                <Field label="Database user">
                  <input className="input" value={form.databaseUser} onChange={(event) => updateForm("databaseUser", event.target.value)} placeholder="project_user" />
                </Field>
                <Field label="Database password" hint="Minimum 12 characters">
                  <input className="input" value={form.databasePassword} onChange={(event) => updateForm("databasePassword", event.target.value)} placeholder="Strong password" type="password" />
                </Field>
                <span className="badge">{databaseProvisioned ? "Provisioned" : databaseReady ? "Ready to provision" : "Optional"}</span>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="workflow-title">
            <div className="panel-header">
              <div className="section-heading">
                <span className="section-number">4</span>
                <div>
                  <p className="panel-kicker">Client repository</p>
                  <h2 className="panel-title" id="workflow-title">GitHub Actions workflow</h2>
                  <p className="panel-subtitle">Add this workflow and the two repository secrets after the project is saved.</p>
                </div>
              </div>
              <button className="btn secondary" type="button" onClick={() => copyText("yaml", yaml)}>{copiedTarget === "yaml" ? "Copied" : "Copy YAML"}</button>
            </div>

            <details className="details-box">
              <summary>View generated workflow YAML</summary>
              <div className="details-content"><pre className="code tall">{yaml}</pre></div>
            </details>

            <div className="review-list" style={{ marginTop: 16 }}>
              <ReviewRow label="DEPLOY_API_URL" value="https://vps.techteamlead.com" />
              <ReviewRow label="DEPLOY_TOKEN" value={deployToken} />
            </div>
          </section>
        </div>

        <aside className="stack summary-panel">
          <section className="panel">
            <div className="progress-row">
              <div>
                <p className="panel-kicker">Setup progress</p>
                <h2 className="panel-title">{progress}% complete</h2>
              </div>
              <span className="badge">{completedCount}/{completionItems.length}</span>
            </div>
            <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
            <div className="checklist">
              {completionItems.map((item) => (
                <div key={item.label} className={`check-row ${item.done ? "done" : ""}`}>
                  <span className="check-icon">{item.done ? "✓" : ""}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <p className="panel-kicker">Review</p>
            <h2 className="panel-title">Project summary</h2>
            <div className="review-list" style={{ marginTop: 14 }}>
              <ReviewRow label="Project" value={form.name || "Not set"} />
              <ReviewRow label="Slug" value={form.slug || "Not set"} />
              <ReviewRow label="Repository" value={form.repoUrl || "Not set"} />
              <ReviewRow label="Branch" value={form.branch || "main"} />
              <ReviewRow label="Domain" value={form.domain || "Not set"} />
              <ReviewRow label="Port" value={form.appPort || "Not set"} />
              <ReviewRow label="Database" value={form.databaseName ? `${form.databaseName}${databaseProvisioned ? " · provisioned" : ""}` : "Skipped"} />
              <ReviewRow label="DB password" value={mask(form.databasePassword)} />
              <ReviewRow label="Environment" value={form.envFileName || "Not uploaded"} />
            </div>

            <button className="btn" type="button" onClick={saveProject} disabled={saveStatus.type === "loading"} style={{ width: "100%", marginTop: 16 }}>
              {saveStatus.type === "loading" ? "Saving project…" : "Save project and continue"}
            </button>

            {saveStatus.message ? (
              <div className={`toast ${saveStatus.type === "success" ? "success" : saveStatus.type === "error" ? "error" : ""}`} style={{ marginTop: 12 }}>
                {saveStatus.message}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <p className="panel-kicker">Next action</p>
            <h2 className="panel-title">
              {completionItems.find((item) => !item.done)?.label || "Ready to save"}
            </h2>
            <p className="panel-subtitle">Work through the page from top to bottom. Optional database fields may remain empty.</p>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="review-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}
