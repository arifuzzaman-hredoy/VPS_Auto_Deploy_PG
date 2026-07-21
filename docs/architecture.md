# Hredoy Deploy OS architecture

## Components

| Component | Responsibility |
|---|---|
| Web (`apps/web`) | GitHub connection, repository import, project setup, CI/CD instructions, environments, domains, deployments, database records and logs |
| API (`apps/api`) | GitHub App JWT/token exchange, signed webhook verification, project/token validation, encrypted state, queue writes, domain verification and database provisioning |
| Runner (`apps/runner`) | Authenticated Git checkout, framework detection, image build, migration, container lifecycle, health checks and proxy switching |
| PostgreSQL | Control-plane, GitHub installation/repository/delivery records and provisioned project databases |
| Redis/BullMQ | Durable common deployment queue for GitHub App, GitHub Actions and manual triggers |
| Docker | Isolated build/runtime boundary for client applications |
| Nginx | Public hostname to healthy-container routing |
| GitHub App | Vercel-like repository import, signed push event source, short-lived repository access and commit deployment status |
| GitHub Actions | Repository-managed CI/CD event source that queues a deployment and waits for its final status |

## Trigger architecture

```text
GitHub App signed push webhook ─┐
                               ├→ createQueuedDeployment()
GitHub Actions bearer token ────┤  → Redis/BullMQ
                               ├→ one runner implementation
Manual dashboard request ───────┘
```

A project stores one active automatic `deploymentMethod`: `GITHUB_APP` or `GITHUB_ACTIONS`. The inactive method can remain configured, but its automatic trigger is rejected. Manual deployment is independent and remains available.

## State transitions

```text
QUEUED
→ CREATED
→ REPO_CLONED
→ FRAMEWORK_DETECTED
→ BUILDING_IMAGE
→ DATABASE_MIGRATION (optional)
→ STARTING_CONTAINER
→ HEALTH_CHECKING
→ UPDATING_PROXY (when a hostname exists)
→ LIVE
```

A previous `LIVE` deployment becomes `SUPERSEDED` only after the replacement is healthy, routed and committed in PostgreSQL. Any failed replacement becomes `FAILED`; the previous live project stays `LIVE`.

## GitHub App flow

1. GitHub redirects an App installation to `/github/setup?installation_id=...`.
2. The API creates an RS256 GitHub App JWT and exchanges it for a short-lived installation access token.
3. Allowed repositories are synchronized into `GitHubInstallation` and `GitHubRepository` records.
4. GitHub sends push/installation events to `/api/github/webhook`.
5. The API verifies `X-Hub-Signature-256` against the untouched raw payload.
6. `X-GitHub-Delivery` is recorded in `GitHubWebhookDelivery` to make redelivery idempotent.
7. Repository, installation, branch and active project method are matched before queueing.
8. The runner requests a fresh installation token, checks out the exact commit and removes the authenticated remote URL after checkout.
9. Pending/success/failure commit status is published when the App has commit-status permission.

## GitHub Actions flow

- Each project stores a hash of its one-time `DEPLOY_TOKEN`.
- The trigger validates project slug, normalized repository, production branch, token and active deployment method.
- GitHub `run_id` + `run_attempt` are recorded for idempotent retries.
- The generated workflow polls the deployment endpoint until `LIVE`, `FAILED` or timeout.

## Repository checkout guarantees

- Each project stores an exact normalized `owner/repository` value.
- GitHub App access must belong to the selected installation and synchronized repository.
- GitHub Actions triggers require repository, branch and project token to match.
- The runner fetches only the configured production branch and verifies the requested commit is its ancestor.
- Each project receives a filesystem deployment lock so two deployments cannot switch the same route concurrently.

## Secret lifecycle

1. API encrypts long-lived project values with `DEPLOY_OS_ENCRYPTION_KEY`.
2. GitHub App installation tokens are short-lived and are never stored in PostgreSQL.
3. Runner decrypts project values only inside the project secret directory.
4. Runtime values are written to a temporary Docker env file.
5. Build values are written as JSON and mounted as a BuildKit secret.
6. Generated Dockerfiles parse JSON without shell-evaluating secret values.
7. All temporary files are removed in a `finally` block.

## Routing and rollback

- Custom domains are eligible only when ownership is `VERIFIED` and DNS is `POINTED`.
- Otherwise the runner uses `<project-slug>.<DEPLOY_OS_APPS_DOMAIN>` when configured.
- Nginx configuration is written and validated with `nginx -t` before reload.
- The previous Nginx config is retained and restored if route/SSL activation or the final database transaction fails.
- Old containers are deleted only after a successful route switch.

## Failure boundaries

- Invalid webhook signature: request is rejected before JSON processing.
- Queue unavailable: trigger returns HTTP 503 and the deployment is marked failed.
- Git/build/migration failure: replacement image/container is cleaned up.
- Health failure: the last 200 container log lines are persisted for diagnosis.
- Nginx/SSL failure: the previous route is restored.
- GitHub status update failure: deployment continues and the warning is stored in deployment logs.
