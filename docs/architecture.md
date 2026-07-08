# Architecture

```txt
GitHub Push
→ GitHub Actions deploy.yml
→ Deploy OS API `/api/deployments/trigger`
→ Runner pulls latest commit using deploy key
→ encrypted env loaded
→ optional DB migration
→ Docker image build
→ new container start
→ health check
→ reverse proxy switch
→ deployment live
```

Core services:

- Web dashboard: project/domain/env/deployment UI
- API control plane: validation, database state, trigger endpoints
- Runner worker: code checkout, build, run, health check, rollback
- DNS manager: provider API, custom provider, wildcard collision check
- Reverse proxy manager: Caddy/Traefik route updates
