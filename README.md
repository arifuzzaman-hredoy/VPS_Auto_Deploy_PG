# Hredoy Deploy OS

Hredoy Deploy OS is a self-hosted, Vercel-style deployment control plane for a VPS. A project is connected once, then every push to its production branch can trigger an isolated Docker build and a zero-downtime deployment through GitHub Actions.

## What is implemented

- Next.js control panel with light and dark mode
- Fastify control-plane API
- PostgreSQL/Prisma state and encrypted secrets
- Redis/BullMQ deployment queue
- Real per-project Ed25519 GitHub deploy keys
- Real per-project CI/CD tokens stored as hashes
- GitHub Actions trigger workflow
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
GitHub push
→ GitHub Actions calls Deploy OS API
→ API validates repository, branch and project token
→ deployment is queued in Redis
→ runner locks the project to prevent concurrent route races
→ exact commit is fetched and verified against the production branch
→ encrypted environment is decrypted only into temporary 0600 files
→ framework is detected and a Docker image is built
→ optional database migration runs
→ new container starts on a private host port
→ health endpoint must return HTTP 2xx/3xx
→ verified custom domain or default apps subdomain is switched in Nginx
→ database state is committed as LIVE
→ previous container is removed
```

If a build, migration, container, health check, SSL or proxy step fails, the new container is removed and the previous live deployment remains available.

## Project setup in the control panel

1. Open **New Project**.
2. Enter the GitHub repository, branch, optional monorepo root directory, runtime overrides, port and health path.
3. Generate the repository deploy key.
4. Add its public key in GitHub: **Settings → Deploy keys**. Keep write access disabled.
5. Upload production environment variables if needed.
6. Provision an optional PostgreSQL database if needed.
7. Save the project and copy the one-time `DEPLOY_TOKEN`.
8. Add repository secrets:
   - `DEPLOY_API_URL=https://vps.techteamlead.com`
   - `DEPLOY_TOKEN=<generated project token>`
9. Create `.github/workflows/deploy.yml` from the generated workflow.
10. Push to the configured production branch.
11. Open the project dashboard to follow deployment logs and live status.

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

The script validates required environment variables, synchronizes the repository, starts PostgreSQL/Redis, updates dependencies only when package metadata changes, synchronizes Prisma, runs typecheck/build, gracefully reloads PM2 services and verifies local and public health endpoints.

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
