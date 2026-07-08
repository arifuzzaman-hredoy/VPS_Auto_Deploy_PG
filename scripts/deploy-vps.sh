#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/techteam-deploy-os"

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

run_with_heartbeat() {
  local label="$1"
  shift

  echo "==> $label"

  (
    while true; do
      echo "heartbeat: $label still running at $(date -Is)"
      sleep 25
    done
  ) &
  local heartbeat_pid="$!"

  set +e
  "$@"
  local exit_code="$?"
  set -e

  kill "$heartbeat_pid" 2>/dev/null || true
  wait "$heartbeat_pid" 2>/dev/null || true

  return "$exit_code"
}

echo "==> Go to app directory"
cd "$APP_DIR"

echo "==> Pull latest code"
git fetch origin main
git reset --hard origin/main

echo "==> Runtime versions"
node -v
npm -v
docker --version
docker compose version

echo "==> Ensure env files"
cp .env apps/api/.env
cp .env apps/runner/.env

echo "==> Start database services"
docker compose -f infra/docker-compose.yml up -d postgres redis

echo "==> Install dependencies"
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false

if [ -f package-lock.json ]; then
  run_with_heartbeat "npm ci" npm ci --prefer-offline --no-audit --no-fund || run_with_heartbeat "npm install fallback" npm install --no-audit --no-fund
else
  run_with_heartbeat "npm install" npm install --no-audit --no-fund
fi

echo "==> Prisma generate + push"
npm run db:generate
npm run db:push

echo "==> Build"
run_with_heartbeat "npm run build" npm run build

echo "==> Stop old Deploy OS PM2 apps"
pm2 delete deploy-os-api deploy-os-web deploy-os-runner 2>/dev/null || true

echo "==> Free Deploy OS ports"
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 4000/tcp 2>/dev/null || true
sleep 3

echo "==> Start Deploy OS PM2 apps"
pm2 start "npm run start -w apps/api" --name deploy-os-api
pm2 start "npm run start -w apps/web" --name deploy-os-web
pm2 start "npm run start -w apps/runner" --name deploy-os-runner

echo "==> Wait for services"
wait_for_url "Local API" "http://127.0.0.1:4000/api/health" 60
wait_for_head "Local Web" "http://127.0.0.1:3000" 60
wait_for_url "Live API" "https://vps.techteamlead.com/api/health" 60

echo "==> Save PM2"
pm2 save

echo "==> Deploy completed"
