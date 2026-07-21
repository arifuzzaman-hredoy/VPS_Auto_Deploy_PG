# GitHub connection and GitHub Actions setup

Hredoy Deploy OS keeps two repository connection methods. Only one automatic method is active per project, while **Deploy now** remains available in both modes.

## Method A: Connect GitHub — automatic push deployment

This is the Vercel-like flow:

```text
Connect GitHub
→ GitHub signs in or uses the current session
→ first use creates the managed Hredoy Deploy OS GitHub App automatically
→ choose a personal account or organization
→ grant all repositories or selected repositories
→ return to Deploy OS
→ select repository, branch and root directory
→ every push to the production branch deploys automatically
```

Open `/github` and press **Connect GitHub**. No App ID, PEM key or webhook secret needs to be copied into the VPS for the normal flow.

### First connection

When no managed GitHub App exists, Deploy OS starts GitHub's App manifest flow. GitHub displays the App registration screen under the signed-in account. After confirmation GitHub returns a one-time manifest code. Deploy OS exchanges it for the App ID, slug, PEM private key and webhook secret, then encrypts sensitive credentials with `DEPLOY_OS_ENCRYPTION_KEY` before storing them in PostgreSQL.

The generated App uses:

```text
Homepage: DEPLOY_OS_PUBLIC_URL
Setup URL: /github/setup
Manifest callback: /github/manifest/callback
Webhook URL: /api/github/webhook
Repository contents: read-only
Metadata: read-only
Commit statuses: read and write
Subscribed event: push
Automatic lifecycle events: installation, installation_repositories (GitHub delivers these to every GitHub App; they must not be listed in manifest default_events)
```

After the App exists, later **Connect GitHub** clicks open its installation page directly. The user chooses a personal account or organization and grants all or selected repository access.

### Push deployment

For a project using **Connect GitHub — automatic push deploy**:

```text
git push to production branch
→ signed GitHub webhook
→ installation/repository/branch validation
→ common deployment queue
→ exact commit checkout with a short-lived installation token
→ Docker build and health check
→ route switch or rollback
→ GitHub commit status update
```

There is no permanent personal access token, repository deploy key, GitHub Actions workflow or Actions secret in this mode.

### Optional environment override

The managed manifest configuration is the default. An already registered external App can override it through VPS environment variables:

```env
GITHUB_APP_ID=<numeric-app-id>
GITHUB_APP_SLUG=<app-slug>
GITHUB_APP_CLIENT_ID=<optional-client-id>
GITHUB_APP_CLIENT_SECRET=<optional-client-secret>
GITHUB_APP_PRIVATE_KEY_BASE64=<base64-pem>
GITHUB_APP_WEBHOOK_SECRET=<webhook-secret>
```

When all required override values are present, Deploy OS uses the environment configuration instead of the encrypted managed record.

## Method B: Repository URL — GitHub Actions setup

Use this when the user does not connect a GitHub account or wants repository-managed CI/CD:

```text
Enter GitHub repository URL
→ save project in GitHub Actions mode
→ generate read-only deploy key
→ generate one-time DEPLOY_TOKEN
→ copy DEPLOY_API_URL and DEPLOY_TOKEN into GitHub Actions secrets
→ copy or download deploy.yml
→ push code
→ GitHub Actions queues deployment and waits for LIVE or FAILED
```

Repository secrets:

```text
DEPLOY_API_URL=https://vps.techteamlead.com
DEPLOY_TOKEN=<one-time-project-token>
```

Add the generated public key in **GitHub repository → Settings → Deploy keys** with write access disabled. Put the generated file at `.github/workflows/deploy.yml`.

This mode does not receive the direct GitHub App push webhook. Automatic deployment begins only after the generated GitHub Actions setup is added manually to the repository.

## Switching methods

The project dashboard can switch between:

```text
Connect GitHub — automatic push deploy
Repository URL — GitHub Actions setup
```

Selecting connected GitHub first opens account/repository/branch selection. The project does not leave its current Actions mode until **Use selected GitHub App repository** succeeds. Switching back to Actions keeps previous App records but accepts automatic requests only from the generated workflow.

## Manual deployment

Manual deployment is always available:

- Empty commit field deploys the latest production-branch commit.
- An exact commit SHA deploys that commit after repository and branch verification.

## Safety

- Webhooks are verified with `X-Hub-Signature-256` against the raw body.
- `X-GitHub-Delivery` is recorded for idempotency.
- Manifest callbacks use a signed, expiring state value.
- Managed PEM keys, webhook secrets and client secrets are encrypted before database storage.
- Installation tokens are short-lived and are never stored in PostgreSQL.
- Repository access is limited to the repositories granted during GitHub App installation.
