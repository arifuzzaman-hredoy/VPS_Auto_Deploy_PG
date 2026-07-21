"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { GitHubConnectButton } from "../../components/GitHubConnectButton";

type DeploymentMethod = "GITHUB_APP" | "GITHUB_ACTIONS";

type GitHubInstallation = { externalId: string; accountLogin: string; status: string; _count: { repositories: number } };
type GitHubRepository = { githubId: string; fullName: string; defaultBranch: string; cloneUrl: string; private: boolean };
type GitHubBranch = { name: string; sha: string; protected: boolean };

type ProjectForm = {
  deploymentMethod: DeploymentMethod;
  autoDeployEnabled: boolean;
  githubInstallationId: string;
  githubRepositoryId: string;
  name: string;
  slug: string;
  repoUrl: string;
  branch: string;
  rootDirectory: string;
  domain: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  appPort: string;
  healthPath: string;
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
  deploymentMethod: "GITHUB_ACTIONS",
  autoDeployEnabled: true,
  githubInstallationId: "",
  githubRepositoryId: "",
  name: "",
  slug: "",
  repoUrl: "",
  branch: "main",
  rootDirectory: ".",
  domain: "",
  installCommand: "",
  buildCommand: "",
  startCommand: "",
  appPort: "3000",
  healthPath: "/",
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
  const [deployToken, setDeployToken] = useState("");
  const [deployTokenMessage, setDeployTokenMessage] = useState("");
  const [githubInstallations, setGitHubInstallations] = useState<GitHubInstallation[]>([]);
  const [githubRepositories, setGitHubRepositories] = useState<GitHubRepository[]>([]);
  const [githubBranches, setGitHubBranches] = useState<GitHubBranch[]>([]);
  const [githubMessage, setGitHubMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/github/installations", { cache: "no-store" });
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error("GitHub installations could not be loaded.");
        const installations = Array.isArray(payload) ? payload as GitHubInstallation[] : [];
        setGitHubInstallations(installations);
        const requested = new URLSearchParams(window.location.search).get("installationId") || "";
        const initialInstallation = requested || installations[0]?.externalId || "";
        if (initialInstallation) {
          setForm((current) => ({
            ...current,
            deploymentMethod: "GITHUB_APP",
            githubInstallationId: initialInstallation,
          }));
        }
      } catch (error) {
        setGitHubMessage(error instanceof Error ? error.message : "GitHub installations could not be loaded.");
      }
    })();
  }, []);

  useEffect(() => {
    if (form.deploymentMethod !== "GITHUB_APP" || !form.githubInstallationId) {
      setGitHubRepositories([]);
      return;
    }
    void (async () => {
      try {
        setGitHubMessage("Loading accessible repositories…");
        const response = await fetch(`/api/github/installations/${form.githubInstallationId}/repositories`, { cache: "no-store" });
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.message || "Repositories could not be loaded.");
        setGitHubRepositories(Array.isArray(payload) ? payload as GitHubRepository[] : []);
        setGitHubMessage("");
      } catch (error) {
        setGitHubRepositories([]);
        setGitHubMessage(error instanceof Error ? error.message : "Repositories could not be loaded.");
      }
    })();
  }, [form.deploymentMethod, form.githubInstallationId]);

  useEffect(() => {
    if (form.deploymentMethod !== "GITHUB_APP" || !form.githubInstallationId || !form.githubRepositoryId) {
      setGitHubBranches([]);
      return;
    }
    const repository = githubRepositories.find((item) => item.githubId === form.githubRepositoryId);
    if (!repository) {
      setGitHubBranches([]);
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`/api/github/installations/${form.githubInstallationId}/branches?repository=${encodeURIComponent(repository.fullName)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.message || "Branches could not be loaded.");
        const branches = Array.isArray(payload) ? payload as GitHubBranch[] : [];
        setGitHubBranches(branches);
        if (branches.length > 0) {
          setForm((current) => branches.some((branch) => branch.name === current.branch)
            ? current
            : { ...current, branch: repository.defaultBranch || branches[0].name });
        }
      } catch (error) {
        setGitHubBranches([]);
        setGitHubMessage(error instanceof Error ? error.message : "Branches could not be loaded.");
      }
    })();
  }, [form.deploymentMethod, form.githubInstallationId, form.githubRepositoryId, githubRepositories]);

  const yaml = useMemo(() => {
    return `name: Deploy with Hredoy Deploy OS

on:
  push:
    branches:
      - ${form.branch || "main"}
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: hredoy-deploy-\${{ github.repository }}-\${{ github.ref_name }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 35

    steps:
      - name: Queue deployment
        id: queue
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          response="$(curl --fail-with-body --silent --show-error \
            --retry 3 --retry-all-errors \
            -X POST "$DEPLOY_API_URL/api/deployments/trigger" \
            -H "Authorization: Bearer $DEPLOY_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
              "projectSlug": "${form.slug || "project-slug"}",
              "repository": "\${{ github.repository }}",
              "branch": "\${{ github.ref_name }}",
              "commit": "\${{ github.sha }}",
              "runId": "\${{ github.run_id }}",
              "runAttempt": "\${{ github.run_attempt }}"
            }')"
          echo "$response"
          deployment_id="$(jq -r '.deploymentId // empty' <<<"$response")"
          test -n "$deployment_id" || { echo "Deploy OS did not return a deployment ID."; exit 1; }
          echo "deployment_id=$deployment_id" >> "$GITHUB_OUTPUT"

      - name: Wait for production deployment
        env:
          DEPLOY_API_URL: \${{ secrets.DEPLOY_API_URL }}
          DEPLOYMENT_ID: \${{ steps.queue.outputs.deployment_id }}
        run: |
          for attempt in $(seq 1 180); do
            response="$(curl --fail-with-body --silent --show-error \
              --retry 3 --retry-all-errors \
              "$DEPLOY_API_URL/api/deployments/$DEPLOYMENT_ID")"
            status="$(jq -r '.status // empty' <<<"$response")"
            echo "Deploy OS status: \${status:-UNKNOWN} (check $attempt/180)"
            case "$status" in
              LIVE) echo "Deployment is live."; exit 0 ;;
              FAILED) echo "$response"; exit 1 ;;
            esac
            sleep 10
          done
          echo "Deployment did not finish within 30 minutes."
          exit 1`;
  }, [form.branch, form.slug]);

  const deployKeyGenerated = deployKeyStatus.type === "success" && Boolean(deployKeyStatus.publicKey);

  const databaseReady = Boolean(
    form.databaseName.trim() &&
      form.databaseUser.trim() &&
      form.databasePassword.trim().length >= 12,
  );

  const completionItems = [
    { label: "Project identity", done: Boolean(form.name.trim() && form.slug.trim()) },
    { label: "GitHub repo URL", done: Boolean(form.repoUrl.trim()) },
    { label: "Repository access", done: form.deploymentMethod === "GITHUB_APP" ? Boolean(form.githubInstallationId && form.githubRepositoryId) : deployKeyGenerated },
    { label: "Runtime config", done: Boolean(form.appPort.trim() && form.healthPath.trim()) },
    { label: "Environment optional", done: !form.envFileName || envErrors.length === 0 },
    { label: "Database optional", done: databaseProvisioned || (!form.databaseName && !form.databaseUser && !form.databasePassword) },
    { label: "Automatic deploy", done: form.deploymentMethod === "GITHUB_APP" ? Boolean(form.autoDeployEnabled) : Boolean(deployToken) },
    { label: "Deployment setup", done: form.deploymentMethod === "GITHUB_APP" ? Boolean(form.githubRepositoryId) : Boolean(yaml) },
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

  const downloadWorkflow = () => {
    const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "deploy.yml";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
    rootDirectory: form.rootDirectory.trim() || ".",
    installCommand: form.installCommand.trim() || null,
    buildCommand: form.buildCommand.trim(),
    startCommand: form.startCommand.trim(),
    appPort: Number(form.appPort),
    healthPath: form.healthPath.trim() || "/",
    primaryDomain: form.domain.trim() || null,
    deploymentMethod: form.deploymentMethod,
    autoDeployEnabled: form.autoDeployEnabled,
    githubInstallationId: form.githubInstallationId || null,
    githubRepositoryId: form.githubRepositoryId || null,
  });

  const validateProjectIdentity = () => {
    if (!form.name.trim()) return "Project name is required before generating a deploy key.";
    if (!form.slug.trim()) return "Project slug is required before generating a deploy key.";
    if (!/^[a-z0-9-]+$/.test(form.slug)) return "Slug can contain only lowercase letters, numbers and hyphen.";
    if (form.deploymentMethod === "GITHUB_APP" && (!form.githubInstallationId || !form.githubRepositoryId)) return "Select a connected GitHub App repository.";
    if (!form.repoUrl.trim()) return "GitHub repo URL is required before generating a deploy key.";
    const repositoryValue = form.repoUrl.trim();
    const isSsh = /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(repositoryValue);
    if (!isSsh) {
      try {
        const repositoryUrl = new URL(repositoryValue);
        if (repositoryUrl.hostname.toLowerCase() !== "github.com") return "Only github.com repositories are supported.";
      } catch {
        return "Enter a valid GitHub HTTPS or SSH repository URL.";
      }
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

  const requestDeployToken = async (resolvedProjectId: string) => {
    const response = await fetch(`/api/projects/${resolvedProjectId}/deploy-token`, { method: "POST" });
    const payload = await parseApiPayload(response);
    if (!response.ok) {
      throw new Error(typeof payload.message === "string" ? payload.message : "Deploy token generation failed.");
    }
    const token = typeof payload.token === "string" ? payload.token : "";
    if (!token.startsWith("dep_live_")) throw new Error("Deploy OS returned an invalid CI/CD token.");
    setDeployToken(token);
    setDeployTokenMessage(typeof payload.message === "string" ? payload.message : "Copy this token now.");
    return token;
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
    if (!/^(?:\.|[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.test(form.rootDirectory.trim() || ".")) return "Root directory must be a safe relative path.";
    if (!/^\d+$/.test(form.appPort) || Number(form.appPort) < 1 || Number(form.appPort) > 65535) return "App port must be between 1 and 65535.";
    if (!form.healthPath.trim().startsWith("/")) return "Health check path must start with /.";
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

      if (form.deploymentMethod === "GITHUB_ACTIONS" && !deployKeyGenerated) {
        await requestDeployKey(resolvedProjectId);
        followUps.push("real Ed25519 deploy key generated");
      }

      if (form.deploymentMethod === "GITHUB_ACTIONS" && !deployToken) {
        await requestDeployToken(resolvedProjectId);
        followUps.push("project CI/CD token generated");
      }
      if (form.deploymentMethod === "GITHUB_APP") followUps.push("GitHub App webhook deploy enabled");

      if (Object.keys(envVariables).length > 0) {
        const envResponse = await fetch(`/api/projects/${resolvedProjectId}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environment: "production", variables: envVariables, replace: true }),
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
        message: `Success: ${followUps.join(" + ")}. ${form.deploymentMethod === "GITHUB_APP" ? "Push to the production branch to deploy automatically." : "Next: add the public key and workflow YAML to the client repo."}`,
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
              setDeployToken("");
              setDeployTokenMessage("");
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
          ["2", "Runtime", "Commands and repository access"],
          ["3", "Environment", "Secrets and database"],
          ["4", "Automation", "GitHub App or Actions"],
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

            <div className="stack" style={{ marginBottom: 18 }}>
              <Field label="Repository connection" hint="Connected GitHub gives Vercel-like push deploys. URL-only repositories use generated GitHub Actions setup.">
                <select className="input" value={form.deploymentMethod} onChange={(event) => {
                  const method = event.target.value as DeploymentMethod;
                  setForm((current) => ({
                    ...current,
                    deploymentMethod: method,
                    githubInstallationId: method === "GITHUB_APP" ? (current.githubInstallationId || githubInstallations[0]?.externalId || "") : "",
                    githubRepositoryId: method === "GITHUB_APP" ? current.githubRepositoryId : "",
                    repoUrl: method === "GITHUB_APP" ? current.repoUrl : current.repoUrl,
                  }));
                  setDeployKeyStatus({ type: "idle", message: "", publicKey: "", fingerprint: "" });
                  setDeployToken("");
                }}>
                  <option value="GITHUB_APP">Connect GitHub — automatic push deploy</option>
                  <option value="GITHUB_ACTIONS">Repository URL — GitHub Actions setup</option>
                </select>
              </Field>
              {form.deploymentMethod === "GITHUB_APP" ? (
                <div className="grid grid-2">
                  <Field label="Connected account" hint="Install the GitHub App first if no account appears.">
                    <select className="input" value={form.githubInstallationId} onChange={(event) => setForm((current) => ({ ...current, githubInstallationId: event.target.value, githubRepositoryId: "", repoUrl: "" }))}>
                      <option value="">Select account</option>
                      {githubInstallations.map((installation) => <option key={installation.externalId} value={installation.externalId}>{installation.accountLogin} · {installation._count.repositories} repos</option>)}
                    </select>
                  </Field>
                  <Field label="Repository" hint="Only repositories granted to the App are listed.">
                    <select className="input" value={form.githubRepositoryId} onChange={(event) => {
                      const repository = githubRepositories.find((item) => item.githubId === event.target.value);
                      setForm((current) => ({
                        ...current,
                        githubRepositoryId: event.target.value,
                        repoUrl: repository?.cloneUrl || "",
                        branch: repository?.defaultBranch || current.branch,
                        name: current.name || repository?.fullName.split("/").pop() || "",
                        slug: current.slug || slugify(repository?.fullName.split("/").pop() || ""),
                      }));
                    }}>
                      <option value="">Select repository</option>
                      {githubRepositories.map((repository) => <option key={repository.githubId} value={repository.githubId}>{repository.fullName}{repository.private ? " · private" : ""}</option>)}
                    </select>
                  </Field>
                </div>
              ) : null}
              {githubMessage ? <div className="notice">{githubMessage}</div> : null}
              {form.deploymentMethod === "GITHUB_APP" && githubInstallations.length === 0 ? <GitHubConnectButton label="Connect GitHub" className="btn" onError={setGitHubMessage} /> : null}
              <label className="check-row done">
                <input type="checkbox" checked={form.autoDeployEnabled} onChange={(event) => setForm((current) => ({ ...current, autoDeployEnabled: event.target.checked }))} />
                <span>{form.deploymentMethod === "GITHUB_APP" ? "Deploy every production-branch push through the connected GitHub webhook" : "Accept production deploys from the generated GitHub Actions workflow"}</span>
              </label>
            </div>

            <div className="form-grid">
              <Field label="Project name" hint="A readable name, for example School ERP">
                <input className="input" value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="School ERP" />
              </Field>
              <Field label="Project slug" hint="Used internally in URLs and deployment names">
                <input className="input" value={form.slug} onChange={(event) => updateForm("slug", slugify(event.target.value))} placeholder="school-erp" />
              </Field>
              <Field label="GitHub repository URL" hint={form.deploymentMethod === "GITHUB_APP" ? "Filled automatically from the connected GitHub repository" : "Paste the GitHub URL. Direct webhook deploy is unavailable until GitHub is connected."} full>
                <input className="input" value={form.repoUrl} readOnly={form.deploymentMethod === "GITHUB_APP"} onChange={(event) => updateForm("repoUrl", event.target.value)} placeholder="https://github.com/owner/repository.git" />
              </Field>
              <Field label="Default branch" hint="The branch that triggers production deploys">
                {form.deploymentMethod === "GITHUB_APP" && githubBranches.length > 0 ? (
                  <select className="input" value={form.branch} onChange={(event) => updateForm("branch", event.target.value)}>
                    {githubBranches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>)}
                  </select>
                ) : (
                  <input className="input" value={form.branch} onChange={(event) => updateForm("branch", event.target.value)} placeholder="main" />
                )}
              </Field>
              <Field label="Root directory" hint="Use . for repository root, or a monorepo folder such as apps/web">
                <input className="input" value={form.rootDirectory} onChange={(event) => updateForm("rootDirectory", event.target.value)} placeholder="." />
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
                  <p className="panel-subtitle">Set build commands and repository access. GitHub App mode needs no manual deploy key.</p>
                </div>
              </div>
              <span className="badge">{form.deploymentMethod === "GITHUB_APP" ? "GitHub App access" : deployKeyGenerated ? "Key ready" : "Key required"}</span>
            </div>

            <div className="form-grid">
              <Field label="Install command" hint="Optional. Leave blank to use automatic package-manager detection">
                <input className="input" value={form.installCommand} onChange={(event) => updateForm("installCommand", event.target.value)} placeholder="npm ci" />
              </Field>
              <Field label="Build command" hint="Optional. Leave blank to auto-detect the package build script">
                <input className="input" value={form.buildCommand} onChange={(event) => updateForm("buildCommand", event.target.value)} placeholder="Auto detect" />
              </Field>
              <Field label="Start command" hint="Optional. Leave blank to auto-detect the package start script">
                <input className="input" value={form.startCommand} onChange={(event) => updateForm("startCommand", event.target.value)} placeholder="Auto detect" />
              </Field>
              <Field label="Application port" hint="The port exposed by the application inside its container">
                <input className="input" inputMode="numeric" value={form.appPort} onChange={(event) => updateForm("appPort", event.target.value)} />
              </Field>
              <Field label="Health check path" hint="Deployment is promoted only after this path responds">
                <input className="input" value={form.healthPath} onChange={(event) => updateForm("healthPath", event.target.value)} placeholder="/api/health" />
              </Field>
            </div>

            {form.deploymentMethod === "GITHUB_ACTIONS" ? (
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
            ) : (
              <div className="notice" style={{ marginTop: 18 }}>
                <strong>No deploy key required:</strong> the GitHub App provides short-lived repository access tokens during each deployment.
              </div>
            )}
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
                  <h2 className="panel-title" id="workflow-title">Deployment automation</h2>
                  <p className="panel-subtitle">Use signed GitHub App webhooks or repository-managed GitHub Actions.</p>
                </div>
              </div>
              {form.deploymentMethod === "GITHUB_ACTIONS" ? (
                <div className="inline-actions">
                  <button className="btn secondary" type="button" onClick={() => copyText("yaml", yaml)}>{copiedTarget === "yaml" ? "Copied" : "Copy YAML"}</button>
                  <button className="btn secondary" type="button" onClick={downloadWorkflow}>Download deploy.yml</button>
                </div>
              ) : <span className="badge">No workflow file needed</span>}
            </div>

            {form.deploymentMethod === "GITHUB_ACTIONS" ? (
              <>
            <div className="stack">
              <div className="notice"><strong>URL-only mode:</strong> Deploy OS generates every required item here. Add them manually in GitHub, then each push will run the workflow and deploy. This repository does not receive direct GitHub webhook deploys.</div>

              <div className="details-box">
                <div className="details-content stack">
                  <strong>1. Add repository deploy key</strong>
                  <p className="panel-subtitle">Copy the public key from Runtime and repository access, then add it in GitHub → Settings → Deploy keys with write access disabled.</p>
                </div>
              </div>

              <div className="details-box">
                <div className="details-content stack">
                  <strong>2. Add GitHub Actions secrets</strong>
                  <div className="review-list">
                    <ReviewRow label="DEPLOY_API_URL" value="https://vps.techteamlead.com" />
                    <ReviewRow label="DEPLOY_TOKEN" value={deployToken || "Save project to generate"} />
                  </div>
                  <div className="inline-actions">
                    <button className="btn secondary" type="button" onClick={() => copyText("api-url", "https://vps.techteamlead.com")}>{copiedTarget === "api-url" ? "Copied" : "Copy DEPLOY_API_URL"}</button>
                    {deployToken ? <button className="btn secondary" type="button" onClick={() => copyText("token", deployToken)}>{copiedTarget === "token" ? "Copied" : "Copy DEPLOY_TOKEN"}</button> : null}
                  </div>
                </div>
              </div>

              <details className="details-box">
                <summary>3. Add .github/workflows/deploy.yml</summary>
                <div className="details-content stack">
                  <pre className="code tall">{yaml}</pre>
                  <div className="inline-actions">
                    <button className="btn secondary" type="button" onClick={() => copyText("yaml", yaml)}>{copiedTarget === "yaml" ? "Copied" : "Copy workflow YAML"}</button>
                    <button className="btn secondary" type="button" onClick={downloadWorkflow}>Download deploy.yml</button>
                  </div>
                </div>
              </details>
            </div>

            {deployToken ? (
              <div className="stack" style={{ marginTop: 16 }}>
                <div className="toast success">{deployTokenMessage || "CI/CD token generated. Copy it now; it cannot be displayed again after refresh."}</div>
                <pre className="code" style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{deployToken}</pre>
                <div className="inline-actions">
                  <button className="btn secondary" type="button" onClick={async () => {
                    try {
                      const resolvedProjectId = await ensureProject();
                      await requestDeployToken(resolvedProjectId);
                    } catch (caughtError) {
                      setSaveStatus({ type: "error", message: caughtError instanceof Error ? caughtError.message : "Token rotation failed." });
                    }
                  }}>Rotate token</button>
                </div>
              </div>
            ) : (
              <div className="notice" style={{ marginTop: 16 }}>Save the project once to generate its real one-time CI/CD token.</div>
            )}

              </>
            ) : (
              <div className="stack">
                <div className="notice"><strong>Connected GitHub mode:</strong> after this project is saved, pushes to the production branch arrive through the signed GitHub App webhook and deploy automatically. No deploy key, GitHub secret or workflow file is required.</div>
                <div className="review-list">
                  <ReviewRow label="Repository" value={form.repoUrl || "Select a repository"} />
                  <ReviewRow label="Production branch" value={form.branch || "main"} />
                  <ReviewRow label="Auto deploy" value={form.autoDeployEnabled ? "Enabled" : "Disabled"} />
                </div>
              </div>
            )}
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
              <ReviewRow label="Root directory" value={form.rootDirectory || "."} />
              <ReviewRow label="Domain" value={form.domain || "Not set"} />
              <ReviewRow label="Port" value={form.appPort || "Not set"} />
              <ReviewRow label="Health" value={form.healthPath || "/"} />
              <ReviewRow label="Deployment method" value={form.deploymentMethod === "GITHUB_APP" ? "GitHub App" : "GitHub Actions"} />
              <ReviewRow label="CI/CD" value={form.deploymentMethod === "GITHUB_APP" ? (form.autoDeployEnabled ? "Webhook enabled" : "Manual only") : deployToken ? "Token generated" : "Token not generated"} />
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

            {projectId && saveStatus.type === "success" ? (
              <a className="btn secondary" href={`/projects/${projectId}`} style={{ width: "100%", marginTop: 12 }}>Open project dashboard</a>
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
