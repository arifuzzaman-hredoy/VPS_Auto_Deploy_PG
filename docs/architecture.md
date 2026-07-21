# Hredoy Deploy OS architecture

## Components

| Component | Responsibility |
|---|---|
| Web (`apps/web`) | Project setup, CI/CD instructions, environments, domains, deployments, database records and logs |
| API (`apps/api`) | Validation, encrypted state, project tokens, queue writes, domain verification and database provisioning |
| Runner (`apps/runner`) | Git checkout, framework detection, image build, migration, container lifecycle, health checks and proxy switching |
| PostgreSQL | Control-plane records plus provisioned project databases |
| Redis/BullMQ | Durable deployment job queue |
| Docker | Isolated build/runtime boundary for client applications |
| Nginx | Public hostname to healthy-container routing |
| GitHub Actions | CI event source; it calls the Deploy OS API and never SSHes to the VPS |

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

## Repository checkout guarantees

- Each project stores an exact normalized `owner/repository` value.
- The API accepts triggers only when repository, branch and project token match.
- GitHub `run_id` + `run_attempt` are used for idempotency.
- The runner fetches only the configured branch and verifies the requested commit is its ancestor.
- Each project receives a filesystem deployment lock so two deployments cannot switch the same route concurrently.

## Secret lifecycle

1. API encrypts values with `DEPLOY_OS_ENCRYPTION_KEY`.
2. Runner decrypts them only inside the project secret directory.
3. Runtime values are written to a temporary Docker env file.
4. Build values are written as JSON and mounted as a BuildKit secret.
5. Generated Dockerfiles parse JSON without shell-evaluating secret values.
6. All temporary files are removed in a `finally` block.

## Routing and rollback

- Custom domains are eligible only when ownership is `VERIFIED` and DNS is `POINTED`.
- Otherwise the runner uses `<project-slug>.<DEPLOY_OS_APPS_DOMAIN>` when configured.
- Nginx config is written and validated with `nginx -t` before reload.
- The previous Nginx config is retained and restored if route/SSL activation or the final database transaction fails.
- Old containers are deleted only after a successful route switch.

## Failure boundaries

- Queue unavailable: trigger returns HTTP 503 and deployment is marked failed.
- Git/build/migration failure: new image/container is cleaned up.
- Health failure: last 200 container log lines are persisted for diagnosis.
- Nginx/SSL failure: previous route is restored.
- Control-plane deployment: PM2 uses `startOrReload`; services are not deleted and ports are not force-killed.
