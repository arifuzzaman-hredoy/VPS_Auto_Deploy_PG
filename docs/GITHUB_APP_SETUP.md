# GitHub App and GitHub Actions setup

Hredoy Deploy OS supports two automatic deployment methods per project. Only one automatic method is active at a time, while **Deploy now** remains available in both modes.

## Method A: GitHub App (recommended)

This is the Vercel-like flow:

```text
Connect GitHub
→ install the GitHub App for selected repositories
→ import a repository
→ choose the production branch and root directory
→ push code
→ signed webhook queues an exact-commit deployment
→ Docker build, health check, route switch and rollback protection
```

### Register the GitHub App once

Create a GitHub App under the GitHub account or organization that owns the deployment service.

Use these URLs:

```text
Homepage URL: https://vps.techteamlead.com
Setup URL: https://vps.techteamlead.com/github/setup
Webhook URL: https://vps.techteamlead.com/api/github/webhook
```

Enable **Redirect on update** for the setup URL.

Repository permissions:

```text
Contents: Read-only
Commit statuses: Read and write
Metadata: Read-only (GitHub provides this automatically)
```

Subscribe to these events:

```text
Push
Installation
Installation repositories
```

Generate a private key for the App and choose a strong webhook secret. Store neither value in Git.

### VPS environment

Add these values to `/var/www/techteam-deploy-os/.env`:

```env
GITHUB_APP_ID=<numeric-app-id>
GITHUB_APP_SLUG=<github-app-slug>
GITHUB_APP_PRIVATE_KEY_BASE64=<base64-encoded-pem-private-key>
GITHUB_APP_WEBHOOK_SECRET=<strong-random-webhook-secret>
```

The same `.env` is copied to the API and runner during control-plane deployment. The API uses the private key to synchronize installations and verify signed webhooks. The runner uses short-lived installation tokens to clone the exact repository and update the commit deployment status.

### Connect repositories

1. Open `/github`.
2. Select **Connect GitHub**.
3. Choose the GitHub account or organization.
4. Grant access to all repositories or selected repositories.
5. GitHub returns to `/github/setup`; Deploy OS synchronizes the installation.
6. Select **Import a repository**.
7. Choose the account, repository, production branch and optional monorepo root directory.
8. Save the project and use **Deploy now**, or push to the selected branch.

No repository deploy key, permanent personal access token, workflow file or GitHub Actions secret is required in GitHub App mode.

## Method B: GitHub Actions

This mode keeps CI/CD configuration in the client repository:

```text
Create project
→ generate read-only repository deploy key
→ generate one-time DEPLOY_TOKEN
→ add GitHub repository secrets
→ copy generated workflow
→ push code
→ workflow queues deployment and waits until LIVE or FAILED
```

Repository secrets:

```text
DEPLOY_API_URL=https://vps.techteamlead.com
DEPLOY_TOKEN=<one-time-project-token>
```

Add the generated public key in GitHub repository **Settings → Deploy keys** with write access disabled. Copy the generated workflow to `.github/workflows/deploy.yml`.

The workflow validates the project slug, repository, branch and token, then polls the deployment record. The GitHub job succeeds only when the deployment becomes `LIVE` and fails when it becomes `FAILED` or exceeds the deployment timeout.

## Switching methods

Open the project dashboard and choose the active method:

```text
GitHub App — Recommended
GitHub Actions
```

Switching methods does not delete the other method's deploy key or token. It only controls which automatic trigger is accepted. This prevents the same push from creating duplicate deployments.

## Manual deployment

Manual deployment is always available:

- Leave the commit empty to deploy the latest commit from the production branch.
- Enter an exact commit SHA to deploy that commit.
- The runner verifies that the requested commit belongs to the configured production branch.

## Webhook delivery safety

- The API verifies `X-Hub-Signature-256` against the raw request body.
- `X-GitHub-Delivery` is recorded for idempotency.
- Pushes are accepted only for an active GitHub App project, the selected installation, repository and production branch.
- Installation removal disables automatic GitHub App deployment for affected projects.
- Repository installation tokens are short-lived and are not stored in PostgreSQL.
