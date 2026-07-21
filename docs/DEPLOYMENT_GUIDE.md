# VPS deployment guide

## 1. DNS prerequisites

Create records before enabling automatic SSL:

```text
vps.example.com      A      <VPS_IP>
*.apps.example.com   A      <VPS_IP>
```

The wildcard record allows every project to receive a default URL such as `clinic.apps.example.com`.

## 2. Required software

- Ubuntu 24.04+
- Node.js 22+
- npm 10+
- Docker + Docker Compose
- PostgreSQL and Redis (provided by `infra/docker-compose.yml`)
- Nginx
- PM2
- Certbot only when `RUNNER_AUTO_SSL=true`

## 3. Repository-specific deploy key

Keep this repository isolated from every other VPS project:

```bash
cd /var/www/techteam-deploy-os
git remote set-url origin git@github.com:OWNER/REPOSITORY.git
git config --local core.sshCommand "ssh -i /root/.ssh/vps_auto_deploy_pg -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git ls-remote origin HEAD
```

Do not modify `/root/.ssh/config` for this workflow.

## 4. Environment

```bash
cd /var/www/techteam-deploy-os
cp .env.example .env
openssl rand -base64 32
nano .env
```

Use `RUNNER_PUBLIC_SCHEME=http` while automatic SSL is off. To enable HTTPS automatically:

```text
RUNNER_AUTO_SSL=true
RUNNER_PUBLIC_SCHEME=https
RUNNER_SSL_EMAIL=admin@example.com
```

Enable these only after the hostname resolves to the VPS.

## 5. First control-plane deploy

```bash
cd /var/www/techteam-deploy-os
npm install
npm run db:generate
npm run db:push
npm run qa:deploy
npm run typecheck
npm run build
pm2 delete deploy-os-api deploy-os-web deploy-os-runner 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save
```

## 6. Self-hosted GitHub Actions runner

The control-plane workflow runs locally on the VPS and calls:

```bash
cd /var/www/techteam-deploy-os
bash scripts/deploy-vps.sh
```

The runner service should remain `active (running)` and must use repository labels matching `.github/workflows/deploy-vps.yml`.

## 7. Connect GitHub (recommended)

Open `https://vps.techteamlead.com/github` and press **Connect GitHub**. On first use, Deploy OS starts GitHub’s App manifest flow, GitHub asks for confirmation, and Deploy OS stores the returned managed App credentials encrypted in PostgreSQL. Then choose the account or organization and grant all or selected repositories.

No manual `GITHUB_APP_*` VPS variables are required for the normal managed flow. Those variables remain available as an optional external-App override; see [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md).

After returning to Deploy OS, import a repository, choose its production branch and root directory, and enable automatic deployment. Every push to that branch is delivered through the signed GitHub App webhook.

## 8. Creating a client project

### GitHub App mode

1. Open `/github` and install the App for the required repositories.
2. Import a repository from **New Project**.
3. Choose branch, monorepo root, port, health path, environment, database and domain.
4. Save and use **Deploy now**, or push to the production branch.

### GitHub Actions mode

1. Create the project and choose **GitHub Actions**.
2. Add its generated public deploy key to the client repository with write access disabled.
3. Add the generated API token and API URL as GitHub Actions secrets.
4. Copy the generated workflow into `.github/workflows/deploy.yml`.
5. Push to the production branch. The workflow waits for the final Deploy OS status.

## 9. Troubleshooting

```bash
cd /var/www/techteam-deploy-os
pm2 status
pm2 logs deploy-os-api --lines 100 --nostream
pm2 logs deploy-os-runner --lines 100 --nostream
docker ps --filter label=hredoy.deploy.project
nginx -t
curl http://127.0.0.1:4000/api/health
```

Deployment-specific output is also stored in the project dashboard and Logs section.
