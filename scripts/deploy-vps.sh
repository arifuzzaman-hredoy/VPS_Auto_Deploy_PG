#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/techteam-deploy-os"
DEPLOY_KEY="/root/.ssh/vps_auto_deploy_pg"
REPOSITORY_URL="git@github.com:arifuzzaman-hredoy/VPS_Auto_Deploy_PG.git"
STATE_DIR="$APP_DIR/.deploy-state"

wait_for_url() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-60}"

  echo "==> Waiting for $name: $url"
  for i in $(seq 1 "$max_attempts"); do
    if curl -fsS "$url" >/tmp/deploy-os-health-check.out 2>/tmp/deploy-os-health-check.err; then
      echo "==> $name is ready"
      cat /tmp/deploy-os-health-check.out || true
      echo
      return 0
    fi
    echo "Waiting for $name... attempt $i/$max_attempts"
    sleep 2
  done

  echo "ERROR: $name did not become ready"
  cat /tmp/deploy-os-health-check.err || true
  pm2 status || true
  pm2 logs deploy-os-api --lines 80 --nostream || true
  pm2 logs deploy-os-web --lines 80 --nostream || true
  exit 1
}

wait_for_head() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-60}"

  echo "==> Waiting for $name: $url"
  for i in $(seq 1 "$max_attempts"); do
    if curl -fsSI "$url" >/dev/null 2>/tmp/deploy-os-health-check.err; then
      echo "==> $name is ready"
      return 0
    fi
    echo "Waiting for $name... attempt $i/$max_attempts"
    sleep 2
  done

  echo "ERROR: $name did not become ready"
  cat /tmp/deploy-os-health-check.err || true
  pm2 status || true
  pm2 logs deploy-os-web --lines 80 --nostream || true
  exit 1
}

require_env() {
  local key="$1"
  if ! grep -q "^${key}=.\+" .env; then
    echo "ERROR: ${key} is missing from $APP_DIR/.env"
    exit 1
  fi
}

echo "==> Go to app directory"
cd "$APP_DIR"
mkdir -p "$STATE_DIR"

echo "==> Runtime"
node -v
npm -v
docker --version
docker compose version
pm2 -v

echo "==> Configure repository-specific Git authentication"
if [ ! -f "$DEPLOY_KEY" ]; then
  echo "ERROR: Repository deploy key not found: $DEPLOY_KEY"
  exit 1
fi
chmod 600 "$DEPLOY_KEY"
git remote set-url origin "$REPOSITORY_URL"
git config --local core.sshCommand "ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

echo "==> Pull latest code"
git fetch origin main
git reset --hard origin/main

echo "==> Validate server configuration"
test -f .env || { echo "ERROR: $APP_DIR/.env is missing"; exit 1; }
require_env DATABASE_URL
require_env REDIS_URL
require_env DEPLOY_OS_ENCRYPTION_KEY
require_env POSTGRES_ADMIN_URL
require_env RUNNER_DOCKER_NETWORK

cp .env apps/api/.env
cp .env apps/runner/.env

echo "==> Start database services and runtime network"
docker compose -f infra/docker-compose.yml up -d postgres redis
RUNTIME_NETWORK="$(grep '^RUNNER_DOCKER_NETWORK=' .env | tail -n1 | cut -d= -f2-)"
docker network inspect "$RUNTIME_NETWORK" >/dev/null 2>&1 || docker network create "$RUNTIME_NETWORK"

echo "==> Dependency check"
PACKAGE_HASH="$({ sha256sum package.json package-lock.json 2>/dev/null; find apps packages -mindepth 2 -maxdepth 2 -name package.json -print0 | sort -z | xargs -0 sha256sum; } | sha256sum | awk '{print $1}')"
PREVIOUS_HASH="$(cat "$STATE_DIR/dependencies.sha256" 2>/dev/null || true)"
if [ ! -d node_modules ] || [ "$PACKAGE_HASH" != "$PREVIOUS_HASH" ]; then
  echo "==> Installing dependencies because package metadata changed"
  npm install --prefer-offline --no-audit --no-fund
  printf '%s' "$PACKAGE_HASH" > "$STATE_DIR/dependencies.sha256"
else
  echo "==> Dependencies unchanged, skipping npm install"
fi

echo "==> Prisma generate + schema sync"
npm run db:generate
npm run db:push

echo "==> Typecheck and build"
npm run typecheck
npm run build

echo "==> Start or reload control-plane services"
unset RUNNER_TRACKING_ID
pm2 startOrReload ecosystem.config.cjs --update-env

echo "==> Wait for services"
wait_for_url "Local API" "http://127.0.0.1:4000/api/health" 60
wait_for_head "Local Web" "http://127.0.0.1:3000" 60
wait_for_url "Live API" "https://vps.techteamlead.com/api/health" 60

echo "==> Save PM2"
pm2 save

echo "==> Deploy completed"
