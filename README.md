# TechTeam Deploy OS — VPS Deploy Platform MVP

Self-hosted Vercel-like deployment platform for one or more VPS servers.

This package contains a production-oriented MVP scaffold:

- Next.js dashboard UI
- Fastify API control plane
- Runner worker skeleton
- PostgreSQL + Prisma schema
- Redis/BullMQ queue integration points
- GitHub deploy key + GitHub Actions trigger flow
- `.env` upload/encrypted env manager design
- PostgreSQL database provisioner
- Domain/subdomain/wildcard DNS workflow
- Popular DNS provider adapter structure
- Custom DNS provider dry-run structure
- Docker/Caddy infra templates

## Important security rules

- Do not run uploaded project code directly on the host VPS.
- Build/run user projects in isolated Docker containers.
- Never store `.env`, deploy private key, or DNS provider API key as plain text.
- Never expose VPS SSH private key in recommended Deploy OS mode.
- Keep old deployment live until the new container passes health check.
- Validate DNS ownership before routing any custom domain.

## Fresh setup

```bash
cd /path/to/techteam-deploy-os
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

## Local infra

```bash
cd /path/to/techteam-deploy-os
docker compose -f infra/docker-compose.yml up -d postgres redis caddy
```

## Recommended CI/CD mode

GitHub Actions only triggers Deploy OS API. The VPS Runner pulls code and deploys.

Required GitHub repository secrets:

```txt
DEPLOY_API_URL=https://deploy.yourdomain.com
DEPLOY_TOKEN=project-specific-token
```

Direct VPS SSH mode is included only as a legacy/backup idea. Prefer Deploy OS mode.
