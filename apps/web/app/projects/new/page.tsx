"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

function mask(value: string) {
  if (!value) return "Not set";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

export default function NewProjectPage() {
  const [form, setForm] = useState<ProjectForm>(initialForm);
  const [deployKeyGenerated, setDeployKeyGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const deployToken = useMemo(() => {
    const seed = form.slug || "project-slug";
    return `dep_live_${seed}_xxxxxxxx`;
  }, [form.slug]);

  const yaml = useMemo(() => {
    return `name: Deploy with TechTeam Deploy OS

on:
  push:
    branches:
      - ${form.branch || "main"}
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Trigger TechTeam Deploy OS
        run: |
          curl -X POST https://vps.techteamlead.com/api/deployments/trigger \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${{ secrets.DEPLOY_TOKEN }}" \\
            -d '{
              "projectSlug": "${form.slug || "project-slug"}",
              "branch": "${form.branch || "main"}"
            }'`;
  }, [form.branch, form.slug]);

  const completionItems = [
    {
      label: "Project name",
      done: Boolean(form.name.trim()),
    },
    {
      label: "Project slug",
      done: Boolean(form.slug.trim()),
    },
    {
      label: "GitHub repository",
      done: Boolean(form.repoUrl.trim()),
    },
    {
      label: "Deploy key generated",
      done: deployKeyGenerated,
    },
    {
      label: "Build/start command",
      done: Boolean(form.buildCommand.trim() && form.startCommand.trim()),
    },
    {
      label: "Database info",
      done: Boolean(
        form.databaseName.trim() &&
          form.databaseUser.trim() &&
          form.databasePassword.trim(),
      ),
    },
    {
      label: ".env uploaded",
      done: Boolean(form.envFileName),
    },
  ];

  const completedCount = completionItems.filter((item) => item.done).length;
  const progress = Math.round((completedCount / completionItems.length) * 100);

  const updateForm = (key: keyof ProjectForm, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && !current.slug ? { slug: slugify(value) } : {}),
    }));
  };

  const copyYaml = async () => {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto flex w-full max-w-[1500px]">
        <aside className="hidden min-h-screen w-72 border-r border-white/10 bg-[#081423] p-6 lg:block">
          <Link href="/" className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500" />
            <span className="text-lg font-black">TechTeam Deploy OS</span>
          </Link>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-bold text-cyan-200">Deployment progress</p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-3xl font-black">{progress}%</p>
            <p className="text-sm text-slate-400">
              {completedCount}/{completionItems.length} setup tasks completed
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {completionItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3"
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${
                    item.done
                      ? "bg-cyan-300 text-slate-950"
                      : "bg-white/10 text-slate-500"
                  }`}
                >
                  {item.done ? "✓" : "•"}
                </span>
                <span className={item.done ? "text-white" : "text-slate-400"}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 px-5 py-6 md:px-10 lg:px-12">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.08]"
              >
                ← Back to Dashboard
              </Link>
              <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">
                Create Project
              </h1>
              <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-400">
                Repo connect, deploy key, environment, database and domain setup —
                সবকিছু এক জায়গায় step-by-step.
              </p>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4 text-sm text-cyan-100">
              <p className="font-black">Current deploy API</p>
              <p className="mt-1 font-mono text-xs text-cyan-200">
                https://vps.techteamlead.com
              </p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_430px]">
            <div className="space-y-6">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-cyan-200">Step 01</p>
                    <h2 className="mt-1 text-2xl font-black">Project Source</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Project name, slug and GitHub repository URL set করো।
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                    Required
                  </span>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <input
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Project name"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                  <input
                    value={form.slug}
                    onChange={(event) => updateForm("slug", slugify(event.target.value))}
                    placeholder="project-slug"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 font-mono text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                  <input
                    value={form.repoUrl}
                    onChange={(event) => updateForm("repoUrl", event.target.value)}
                    placeholder="GitHub repo URL"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70 md:col-span-2"
                  />
                  <input
                    value={form.branch}
                    onChange={(event) => updateForm("branch", event.target.value)}
                    placeholder="Branch, example: main"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                  <input
                    value={form.domain}
                    onChange={(event) => updateForm("domain", event.target.value)}
                    placeholder="Domain, example: app.example.com"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                <p className="text-sm font-black text-cyan-200">Step 02</p>
                <h2 className="mt-1 text-2xl font-black">Deploy Key & Build Config</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Generate key করার পর public key GitHub repo deploy key হিসেবে add করতে হবে।
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <input
                    value={form.buildCommand}
                    onChange={(event) => updateForm("buildCommand", event.target.value)}
                    placeholder="Build command"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                  <input
                    value={form.startCommand}
                    onChange={(event) => updateForm("startCommand", event.target.value)}
                    placeholder="Start command"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                  <input
                    value={form.appPort}
                    onChange={(event) => updateForm("appPort", event.target.value)}
                    placeholder="App port"
                    className="h-14 rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3 md:flex-row">
                  <button
                    type="button"
                    onClick={() => setDeployKeyGenerated(true)}
                    className="rounded-2xl bg-cyan-300 px-6 py-4 font-black text-slate-950 hover:bg-cyan-200"
                  >
                    Generate Deploy Key
                  </button>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-sm text-slate-300">
                    {deployKeyGenerated
                      ? "Deploy key generated. Now add public key to GitHub repo settings."
                      : "Generate deploy key first, then connect your GitHub repository."}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                  <p className="text-sm font-black text-cyan-200">Step 03</p>
                  <h2 className="mt-1 text-2xl font-black">Database Setup</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    PostgreSQL database credentials set করো।
                  </p>

                  <div className="mt-6 space-y-4">
                    <input
                      value={form.databaseName}
                      onChange={(event) => updateForm("databaseName", event.target.value)}
                      placeholder="database_name"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                    />
                    <input
                      value={form.databaseUser}
                      onChange={(event) => updateForm("databaseUser", event.target.value)}
                      placeholder="database_user"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                    />
                    <input
                      value={form.databasePassword}
                      onChange={(event) =>
                        updateForm("databasePassword", event.target.value)
                      }
                      placeholder="strong database password"
                      type="password"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#101d2d] px-5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/70"
                    />
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                  <p className="text-sm font-black text-cyan-200">Step 04</p>
                  <h2 className="mt-1 text-2xl font-black">.env Upload</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Secrets encrypted থাকবে এবং build/runtime এ inject হবে।
                  </p>

                  <label className="mt-6 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-cyan-300/30 bg-cyan-300/5 p-6 text-center hover:bg-cyan-300/10">
                    <input
                      type="file"
                      accept=".env,.txt"
                      className="hidden"
                      onChange={(event) =>
                        updateForm("envFileName", event.target.files?.[0]?.name || "")
                      }
                    />
                    <span className="text-3xl">⬆</span>
                    <span className="mt-3 font-black">
                      {form.envFileName || "Choose .env file"}
                    </span>
                    <span className="mt-2 text-sm text-slate-400">
                      .env file select করো, secrets UI-তে show হবে না।
                    </span>
                  </label>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-cyan-200">Step 05</p>
                    <h2 className="text-2xl font-black">Review & Deploy</h2>
                  </div>
                  <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-200">
                    {progress}% Ready
                  </span>
                </div>

                <div className="mt-6 space-y-3 text-sm">
                  <ReviewRow label="Project" value={form.name || "Not set"} />
                  <ReviewRow label="Slug" value={form.slug || "Not set"} />
                  <ReviewRow label="Branch" value={form.branch || "main"} />
                  <ReviewRow label="Domain" value={form.domain || "Not set"} />
                  <ReviewRow label="Port" value={form.appPort || "3000"} />
                  <ReviewRow label="DB Name" value={form.databaseName || "Not set"} />
                  <ReviewRow label="DB User" value={form.databaseUser || "Not set"} />
                  <ReviewRow label="DB Pass" value={mask(form.databasePassword)} />
                  <ReviewRow label=".env" value={form.envFileName || "Not uploaded"} />
                </div>

                <button
                  type="button"
                  className="mt-6 w-full rounded-2xl bg-cyan-300 px-6 py-4 font-black text-slate-950 hover:bg-cyan-200"
                >
                  Save Project & Continue
                </button>

                <button
                  type="button"
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 font-bold text-slate-200 hover:bg-white/[0.08]"
                >
                  Save as Draft
                </button>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[#07101c] p-6 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-black">Generated GitHub Actions YAML</h2>
                  <button
                    type="button"
                    onClick={copyYaml}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/20"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <pre className="mt-4 max-h-[430px] overflow-auto rounded-2xl bg-black/50 p-5 text-xs leading-6 text-cyan-100">
                  {yaml}
                </pre>

                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                  GitHub repo → Settings → Secrets and variables → Actions → add:
                  <br />
                  <span className="font-mono">DEPLOY_TOKEN = {deployToken}</span>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="max-w-[230px] truncate text-right font-bold text-white">
        {value}
      </span>
    </div>
  );
}
