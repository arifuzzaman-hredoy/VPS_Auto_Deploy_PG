# TechTeam Deploy OS - Final ZIP Setup

This ZIP includes the latest VPS production fixes:

- BullMQ Redis connection type fix
- `pg` TypeScript types
- VPS-safe PostgreSQL/Redis ports: `15434` and `6380`
- GitHub Actions workflow: `.github/workflows/deploy-vps.yml`
- VPS deploy script with wait/retry health checks: `scripts/deploy-vps.sh`

## Local setup

```powershell
cd "G:\Current Project\Development\VPS Project\techteam-deploy-os-code"
npm install
npm run db:generate
npm run build
code .
```

## Production URL

- https://vps.techteamlead.com
- https://vps.techteamlead.com/api/health

## GitHub Actions secrets needed

- `VPS_HOST`
- `VPS_USER`
- `VPS_PORT`
- `VPS_SSH_KEY_B64`

Never commit `.env` or private keys.
