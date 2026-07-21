# Final setup checklist

1. Fill `/var/www/techteam-deploy-os/.env` from `.env.example`.
2. Point the control-panel domain and wildcard apps domain to the VPS.
3. Verify the repository-specific deploy key with `git ls-remote origin HEAD`.
4. Run `npm install`, `npm run db:generate`, `npm run qa:deploy`, `npm run typecheck`, `npm run build`.
5. Run `bash scripts/deploy-vps.sh`.
6. Confirm API health and all three PM2 services.
7. Create a test project, add its deploy key and GitHub secrets, then push a commit.
8. Confirm the project reaches `LIVE`, its URL opens and a failed replacement leaves the previous deployment online.

Full instructions: `docs/DEPLOYMENT_GUIDE.md`.
