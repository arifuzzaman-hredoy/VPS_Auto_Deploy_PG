# Hredoy Deploy OS

Hredoy Deploy OS is a self-hosted, Vercel-style deployment control plane for a VPS. Projects can connect through a Vercel-like GitHub App or repository-managed GitHub Actions; both methods use the same isolated Docker deployment and rollback engine.

## What is implemented

- Next.js control panel with light and dark mode
- Fastify control-plane API
- PostgreSQL/Prisma state and encrypted secrets
- Redis/BullMQ deployment queue
- Real per-project Ed25519 GitHub deploy keys
- Real per-project CI/CD tokens stored as hashes
- Vercel-like GitHub App installation, repository import and signed push webhooks
- GitHub Actions trigger workflow with production-status polling
- Framework detection for Next.js, Vite, Node.js, static sites and custom Dockerfiles
- Docker image build with BuildKit secrets
- Optional PostgreSQL database provisioning and Prisma migration
- Container health checks and captured failure logs
- Nginx route switching with rollback
- Optional Certbot SSL
- Previous live container kept until the replacement is healthy
- Project, deployment, domain, environment, database and log management

## Deployment flow

```text
GitHub App push webhook ─────┐
                            ├→ common deployment queue
GitHub Actions API trigger ──┤
                            ├→ exact commit checkout
Manual Deploy now ───────────┘  → framework detection
                               → isolated Docker image
                               → optional migration
                               → new-container health check
                               → Nginx route switch
                               → LIVE or safe rollback
```

Only one automatic method is active per project, preventing duplicate deployments. Manual deployment remains available in both modes. If build, migration, container, health, SSL or proxy activation fails, the replacement is cleaned up and the previous live deployment remains available.

## GitHub connection methods

### GitHub App — recommended

1. Open **GitHub** in Deploy OS and press **Connect GitHub**.
2. On first use, GitHub confirms creation of this server’s managed App; Deploy OS stores its credentials encrypted.
3. Choose a personal account or organization and grant all or selected repositories.
4. Import a repository, select its production branch and optional monorepo root.
5. Push to the selected branch. The signed webhook queues the exact commit automatically.

GitHub App mode uses short-lived installation tokens. Normal setup requires no VPS App credentials, repository deploy key, personal access token, workflow file or GitHub Actions secret. Environment App credentials remain available only as an optional override.

### GitHub Actions

1. Create the project and select **GitHub Actions**.
2. Generate the read-only repository deploy key and one-time `DEPLOY_TOKEN`.
3. Add `DEPLOY_API_URL` and `DEPLOY_TOKEN` as repository secrets.
4. Copy the generated `.github/workflows/deploy.yml`.
5. Push to the production branch. The workflow queues the deployment and waits until it becomes `LIVE` or `FAILED`.

See [docs/GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md) for the one-click GitHub connection and URL-only GitHub Actions setup flows.

## Local validation

```bash
cd /path/to/techteam-deploy-os
npm install
npm run db:generate
npm run qa:deploy
npm run typecheck
npm run build
```

## VPS control-plane deployment

The repository uses a self-hosted GitHub Actions runner on the VPS. The control-plane repository has its own deploy key configured only in its local `.git/config`; it does not depend on global SSH aliases and does not affect other projects.

```bash
cd /var/www/techteam-deploy-os
bash scripts/deploy-vps.sh
```

The script validates required environment variables, synchronizes the repository, starts PostgreSQL/Redis, updates dependencies only when package metadata changes, synchronizes Prisma, runs the affected typecheck/build plan, recreates Deploy OS PM2 services with direct Node entrypoints when required, and verifies local and public health endpoints.

## Required VPS environment

Copy `.env.example` to `.env` and replace all placeholder values. Important settings:

- `DATABASE_URL`: Deploy OS control-plane database
- `REDIS_URL`: BullMQ Redis connection
- `DEPLOY_OS_ENCRYPTION_KEY`: base64-encoded 32-byte encryption key
- `POSTGRES_ADMIN_URL`: PostgreSQL account allowed to create project databases and roles
- `POSTGRES_PROJECT_HOST`: hostname project containers use to reach PostgreSQL
- `RUNNER_DOCKER_NETWORK`: shared Docker network for apps and PostgreSQL
- `DEPLOY_OS_APPS_DOMAIN`: wildcard apps base, such as `apps.example.com`
- `RUNNER_PUBLIC_SCHEME`: use `http` until SSL is configured, then `https`
- `RUNNER_AUTO_SSL`: enable only after DNS resolves and Certbot is installed

See [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for the full server checklist.

## Security model

- Project private keys, environment values, database passwords and provider credentials are encrypted at rest.
- Build environment is supplied through a JSON BuildKit secret and is never evaluated as shell code.
- Temporary key/environment files use `0600` permissions and are removed after every job.
- Project images run in Docker with CPU/memory limits and no host source execution.
- Custom domains are routed only after DNS and ownership verification.
- CI/CD tokens are shown once and only their SHA-256 hashes are stored.
- Database/log administration is currently open because this installation was intentionally configured without an admin-token gate. Restrict the control-panel domain at Nginx, VPN or firewall level before exposing it publicly.
