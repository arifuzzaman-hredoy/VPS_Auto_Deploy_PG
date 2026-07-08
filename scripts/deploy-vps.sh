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

echo "==> Go to app directory"
cd "$APP_DIR"

echo "==> Runtime"
node -v
npm -v
docker --version
docker compose version

echo "==> Pull latest code"
git fetch origin main
git reset --hard origin/main

echo "==> Ensure env files"
cp .env apps/api/.env
cp .env apps/runner/.env

echo "==> Start database services"
docker compose -f infra/docker-compose.yml up -d postgres redis

echo "==> Dependency check"
if [ -d node_modules ] && [ -d node_modules/.prisma ] && [ -d node_modules/@prisma ]; then
  echo "==> node_modules exists, skipping npm install"
else
  echo "==> node_modules missing, installing dependencies once"
  npm install --prefer-offline --no-audit --no-fund
fi

echo "==> Prisma generate + push"
npm run db:generate
npm run db:push

echo "==> Build"
npm run build

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
