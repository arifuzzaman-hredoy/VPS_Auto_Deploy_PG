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
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
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
    { label: "Database optional", done: databaseReady || (!form.databaseName && !form.databaseUser && !form.databasePassword) },
    { label: ".env parsed", done: Boolean(form.envFileName && envErrors.length === 0) },
    { label: "Generated YAML", done: Boolean(yaml) },
  ];

  const completedCount = completionItems.filter((item) => item.done).length;
  const progress = Math.round((completedCount / completionItems.length) * 100);

  const updateForm = (key: keyof ProjectForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateProjectName = (value: string) => {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugManuallyEdited ? current.slug : slugify(value),
    }));
  };

  const updateProjectSlug = (value: string) => {
    const normalizedSlug = slugify(value);
    setSlugManuallyEdited(Boolean(normalizedSlug));
    setForm((current) => ({
      ...current,
      slug: normalizedSlug,
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
    // This endpoint has no request payload. A JSON content type with an empty or
    // proxy-stripped body makes Fastify reject the request before the handler runs.
    const response = await fetch(`/api/projects/${encodeURIComponent(resolvedProjectId)}/deploy-keys`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
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
        if (!databaseResponse.ok) throw new Error("Project/env saved, but database provisioning failed.");
        followUps.push("database provisioned");
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
      title="Create Project"
      description="Repo, deploy key, GitHub Actions YAML, .env, database and domain setup — এক page-এ clear step-by-step workflow."
      backHref="/"
      backLabel="Back to Dashboard"
      actions={
        <>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setForm(initialForm);
              setProjectId("");
              setSlugManuallyEdited(false);
              setDeployKeyStatus({ type: "idle", message: "", publicKey: "", fingerprint: "" });
              setEnvVariables({});
              setEnvErrors([]);
              setSaveStatus({ type: "idle", message: "" });
            }}
          >
            Reset form
          </button>
          <button className="btn" type="button" onClick={saveProject} disabled={saveStatus.type === "loading"}>
            {saveStatus.type === "loading" ? "Saving..." : "Save Project"}
          </button>
        </>
      }
    >
      <div className="process-strip">
        {[
          ["1", "Source", "Name, slug, repo"],
          ["2", "Key", "Deploy key + YAML"],
          ["3", "Env", "Secrets upload"],
          ["4", "Database", "Optional Postgres"],
          ["5", "Review", "Save + next steps"],
        ].map(([no, title, text], index) => (
          <div key={no} className={`process-item ${completedCount > index ? "done" : ""}`}>
            <span>{no}</span>
            <strong>{title}</strong>
            <small>{text}</small>
          </div>
        ))}
      </div>

      <section className="layout-2-rail">
        <div className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Step 01</p>
                <h2 className="panel-title">Project Source</h2>
                <p className="panel-subtitle">Client project কোন GitHub repo থেকে deploy হবে সেটা set করো।</p>
              </div>
              <span className="badge">Required</span>
            </div>

            <div className="form-grid">
              <Field label="Project name" hint="Example: School ERP / Clinic Website">
                <input className="input" value={form.name} onChange={(event) => updateProjectName(event.target.value)} placeholder="Project name" />
              </Field>
              <Field label="Project slug" hint="URL-safe internal ID">
                <input className="input" value={form.slug} onChange={(event) => updateProjectSlug(event.target.value)} placeholder="project-slug" />
              </Field>
              <Field label="GitHub repo URL" hint="Private/public repo both supported" full>
                <input className="input" value={form.repoUrl} onChange={(event) => updateForm("repoUrl", event.target.value)} placeholder="https://github.com/owner/repo" />
              </Field>
              <Field label="Default branch" hint="Usually main or master">
                <input className="input" value={form.branch} onChange={(event) => updateForm("branch", event.target.value)} placeholder="main" />
              </Field>
              <Field label="Primary domain" hint="Optional for now">
                <input className="input" value={form.domain} onChange={(event) => updateForm("domain", event.target.value)} placeholder="app.example.com" />
              </Field>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Step 02</p>
                <h2 className="panel-title">Deploy Key & Runtime Commands</h2>
                <p className="panel-subtitle">Private repo হলে generated public key GitHub repo deploy key হিসেবে add করতে হবে।</p>
              </div>
              <span className={deployKeyGenerated ? "badge" : "badge gray"}>{deployKeyGenerated ? "Generated" : "Waiting"}</span>
            </div>

            <div className="form-grid three">
              <Field label="Build command" hint="Next.js default">
                <input className="input" value={form.buildCommand} onChange={(event) => updateForm("buildCommand", event.target.value)} />
              </Field>
              <Field label="Start command" hint="PM2/Docker runtime">
                <input className="input" value={form.startCommand} onChange={(event) => updateForm("startCommand", event.target.value)} />
              </Field>
              <Field label="App port" hint="Example: 3000 / 4000">
                <input className="input" value={form.appPort} onChange={(event) => updateForm("appPort", event.target.value)} />
              </Field>
            </div>

            <div className="stack" style={{ marginTop: 16 }}>
              <div className="notice good">
                <strong>How it works:</strong> Deploy OS project draft save করবে, real Ed25519 key pair generate করবে, public key এখানে দেখাবে এবং private key encrypted অবস্থায় server database-এ রাখবে। Private key browser-এ পাঠানো হবে না।
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={generateDeployKey}
                  disabled={deployKeyStatus.type === "loading" || saveStatus.type === "loading"}
                >
                  {deployKeyStatus.type === "loading"
                    ? "Generating Real Key..."
                    : deployKeyGenerated
                      ? "Load Active Deploy Key"
                      : "Generate Real Deploy Key"}
                </button>
                {projectId ? <span className="badge gray">Draft saved: {projectId.slice(0, 10)}...</span> : null}
              </div>

              {deployKeyStatus.message ? (
                <div className={`toast ${deployKeyStatus.type === "success" ? "success" : deployKeyStatus.type === "error" ? "error" : ""}`}>
                  {deployKeyStatus.message}
                </div>
              ) : null}

              {deployKeyGenerated ? (
                <div className="stack">
                  <div>
                    <strong style={{ display: "block", marginBottom: 8 }}>Public deploy key</strong>
                    <pre
                      className="code"
                      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-all" }}
                    >
                      {deployKeyStatus.publicKey}
                    </pre>
                  </div>
                  <div className="review-list">
                    <ReviewRow label="Fingerprint" value={deployKeyStatus.fingerprint || "Unavailable"} />
                    <ReviewRow label="Private key" value="Encrypted on server — never shown" />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => copyText("key", deployKeyStatus.publicKey)}
                    >
                      {copiedTarget === "key" ? "Copied" : "Copy public key"}
                    </button>
                  </div>
                  <div className="notice">
                    GitHub repo → <strong>Settings</strong> → <strong>Deploy keys</strong> → <strong>Add deploy key</strong> → এই public key paste করো। <strong>Allow write access</strong> unchecked রাখবে।
                  </div>
                </div>
              ) : (
                <pre className="code">Fill Project Source, then click Generate Real Deploy Key.</pre>
              )}
            </div>
          </div>

          <div className="grid grid-2">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Step 03</p>
                  <h2 className="panel-title">.env Upload</h2>
                  <p className="panel-subtitle">Secrets UI-তে value দেখাবে না, শুধু key count দেখাবে।</p>
                </div>
                <span className={envErrors.length ? "badge warn" : "badge gray"}>{Object.keys(envVariables).length} keys</span>
              </div>

              <label className="upload-box">
                <input type="file" accept=".env,.txt" onChange={(event) => handleEnvFile(event.target.files?.[0])} />
                <strong>{form.envFileName || "Choose .env file"}</strong>
                <small>Only key names are previewed. Values stay hidden.</small>
              </label>

              {envErrors.length ? (
                <div className="toast error">
                  {envErrors.map((error) => <div key={error}>{error}</div>)}
                </div>
              ) : form.envFileName ? (
                <div className="toast success">Parsed successfully: {Object.keys(envVariables).join(", ") || "No variables found"}</div>
              ) : null}
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="panel-kicker">Step 04</p>
                  <h2 className="panel-title">Database Setup</h2>
                  <p className="panel-subtitle">Blank রাখলে database provisioning skip হবে। Password minimum 12 chars.</p>
                </div>
                <span className={databaseReady ? "badge" : "badge gray"}>{databaseReady ? "Ready" : "Optional"}</span>
              </div>

              <div className="stack">
                <input className="input" value={form.databaseName} onChange={(event) => updateForm("databaseName", event.target.value)} placeholder="database_name" />
                <input className="input" value={form.databaseUser} onChange={(event) => updateForm("databaseUser", event.target.value)} placeholder="database_user" />
                <input className="input" value={form.databasePassword} onChange={(event) => updateForm("databasePassword", event.target.value)} placeholder="strong database password" type="password" />
              </div>
            </div>
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Progress</p>
                <h2 className="panel-title">{progress}% Ready</h2>
              </div>
              <span className="badge gray">{completedCount}/{completionItems.length}</span>
            </div>
            <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
            <div className="checklist" style={{ marginTop: 16 }}>
              {completionItems.map((item) => (
                <div key={item.label} className={`check-row ${item.done ? "done" : ""}`}>
                  <span className="check-icon">{item.done ? "✓" : "•"}</span>
                  <strong>{item.label}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <p className="panel-kicker">Review</p>
            <h2 className="panel-title">Before Save</h2>
            <div className="review-list" style={{ marginTop: 16 }}>
              <ReviewRow label="Project" value={form.name || "Not set"} />
              <ReviewRow label="Slug" value={form.slug || "Not set"} />
              <ReviewRow label="Repo" value={form.repoUrl || "Not set"} />
              <ReviewRow label="Branch" value={form.branch || "main"} />
              <ReviewRow label="Domain" value={form.domain || "Not set"} />
              <ReviewRow label="DB" value={form.databaseName || "Skipped"} />
              <ReviewRow label="DB Pass" value={mask(form.databasePassword)} />
              <ReviewRow label="Env" value={form.envFileName || "Not uploaded"} />
            </div>
            <button className="btn" type="button" onClick={saveProject} disabled={saveStatus.type === "loading"} style={{ width: "100%", marginTop: 16 }}>
              {saveStatus.type === "loading" ? "Saving..." : "Save Project & Continue"}
            </button>
            {saveStatus.message ? <div className={`toast ${saveStatus.type === "success" ? "success" : saveStatus.type === "error" ? "error" : ""}`}>{saveStatus.message}</div> : null}
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">GitHub Actions</p>
                <h2 className="panel-title">Generated YAML</h2>
              </div>
              <button className="btn ghost" type="button" onClick={() => copyText("yaml", yaml)}>{copiedTarget === "yaml" ? "Copied" : "Copy"}</button>
            </div>
            <pre className="code tall">{yaml}</pre>
            <div className="notice" style={{ marginTop: 14 }}>
              Client repo secrets add করো:<br />
              <strong>DEPLOY_API_URL</strong> = https://vps.techteamlead.com<br />
              <strong>DEPLOY_TOKEN</strong> = {deployToken}
            </div>
          </div>
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
      <strong>{value}</strong>
    </div>
  );
}
