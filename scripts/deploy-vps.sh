#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/techteam-deploy-os"
DEPLOY_KEY="/root/.ssh/vps_auto_deploy_pg"
REPOSITORY_URL="git@github.com:arifuzzaman-hredoy/VPS_Auto_Deploy_PG.git"
STATE_DIR="$APP_DIR/.deploy-state"
NPM_CACHE_DIR="/var/cache/hredoy-deploy-os/npm"
PM2_APPS=(deploy-os-api deploy-os-web deploy-os-runner)
FORCE_FULL_DEPLOY="${FORCE_FULL_DEPLOY:-false}"

BUILD_API=0
BUILD_WEB=0
BUILD_RUNNER=0
SYNC_SCHEMA=0
INSTALL_DEPS=0
RECREATE_PM2=0
RUNTIME_CHANGE=0
FULL_VALIDATION=0
PACKAGE_CHECKS=()
CHANGED_FILES=()

log() {
  printf '==> %s\n' "$*"
}

pm2_status_for() {
  local app_name="$1"
  pm2 jlist 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const apps = JSON.parse(input);
        const app = apps.find((item) => item.name === process.argv[1]);
        process.stdout.write(app?.pm2_env?.status ?? "missing");
      } catch {
        process.stdout.write("unknown");
      }
    });
  ' "$app_name"
}

dump_service_logs() {
  local app_name="$1"
  docker compose -f infra/docker-compose.yml ps || true
  pm2 status || true
  pm2 logs "$app_name" --lines 80 --nostream || true
}

wait_for_service() {
  local name="$1"
  local url="$2"
  local app_name="$3"
  local head_only="${4:-false}"
  local max_attempts="${5:-20}"

  log "Waiting for $name: $url"
  for i in $(seq 1 "$max_attempts"); do
    if [ "$head_only" = "true" ]; then
      if curl -fsSI --max-time 3 "$url" >/dev/null 2>/tmp/deploy-os-health-check.err; then
        log "$name is ready"
        return 0
      fi
    elif curl -fsS --max-time 3 "$url" >/tmp/deploy-os-health-check.out 2>/tmp/deploy-os-health-check.err; then
      log "$name is ready"
      cat /tmp/deploy-os-health-check.out || true
      echo
      return 0
    fi

    local status
    status="$(pm2_status_for "$app_name")"
    if [ "$i" -ge 3 ] && { [ "$status" = "errored" ] || [ "$status" = "stopped" ] || [ "$status" = "missing" ]; }; then
      echo "ERROR: $app_name entered PM2 status '$status' before $name became ready"
      cat /tmp/deploy-os-health-check.err || true
      dump_service_logs "$app_name"
      exit 1
    fi

    echo "Waiting for $name... attempt $i/$max_attempts (PM2: $status)"
    sleep 1
  done

  echo "ERROR: $name did not become ready"
  cat /tmp/deploy-os-health-check.err || true
  dump_service_logs "$app_name"
  exit 1
}

wait_for_redis() {
  log "Waiting for Redis"
  for i in $(seq 1 30); do
    if docker exec deploy-os-redis redis-cli ping 2>/dev/null | grep -qx 'PONG'; then
      log "Redis is ready"
      return 0
    fi
    echo "Waiting for Redis... attempt $i/30"
    sleep 1
  done

  echo "ERROR: Redis did not become ready"
  docker logs --tail 100 deploy-os-redis || true
  exit 1
}

wait_for_postgres() {
  log "Waiting for PostgreSQL"
  for i in $(seq 1 30); do
    if docker exec deploy-os-postgres pg_isready -U deploy_os -d deploy_os >/dev/null 2>&1; then
      log "PostgreSQL is ready"
      return 0
    fi
    echo "Waiting for PostgreSQL... attempt $i/30"
    sleep 1
  done

  echo "ERROR: PostgreSQL did not become ready"
  docker logs --tail 100 deploy-os-postgres || true
  exit 1
}

require_env() {
  local key="$1"
  if ! grep -q "^${key}=.\+" .env; then
    echo "ERROR: ${key} is missing from $APP_DIR/.env"
    exit 1
  fi
}

add_package_check() {
  local workspace="$1"
  local existing
  for existing in "${PACKAGE_CHECKS[@]:-}"; do
    [ "$existing" = "$workspace" ] && return 0
  done
  PACKAGE_CHECKS+=("$workspace")
}

root_package_runtime_changed() {
  local base_sha="$1"
  local old_package
  old_package="$(mktemp)"
  if ! git show "${base_sha}:package.json" >"$old_package" 2>/dev/null; then
    rm -f "$old_package"
    return 0
  fi

  node - "$old_package" package.json <<'NODE'
const fs = require('node:fs');
const [oldPath, newPath] = process.argv.slice(2);
const oldPackage = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
const newPackage = JSON.parse(fs.readFileSync(newPath, 'utf8'));
const importantScripts = ['build', 'typecheck', 'db:generate', 'db:push'];
const select = (value) => ({
  dependencies: value.dependencies ?? {},
  devDependencies: value.devDependencies ?? {},
  optionalDependencies: value.optionalDependencies ?? {},
  peerDependencies: value.peerDependencies ?? {},
  workspaces: value.workspaces ?? [],
  engines: value.engines ?? {},
  packageManager: value.packageManager ?? null,
  scripts: Object.fromEntries(importantScripts.map((key) => [key, value.scripts?.[key] ?? null])),
});
process.exit(JSON.stringify(select(oldPackage)) === JSON.stringify(select(newPackage)) ? 1 : 0);
NODE
  local changed=$?
  rm -f "$old_package"
  return "$changed"
}

prepare_standalone_web() {
  local standalone_root="$APP_DIR/apps/web/.next/standalone"
  local runtime_dir=""

  if [ -f "$standalone_root/apps/web/server.js" ]; then
    runtime_dir="$standalone_root/apps/web"
  elif [ -f "$standalone_root/server.js" ]; then
    runtime_dir="$standalone_root"
  else
    echo "ERROR: Next.js standalone server was not generated"
    echo "next.config.ts must contain output: 'standalone'"
    find "$APP_DIR/apps/web/.next" -maxdepth 4 -type f -name server.js -print 2>/dev/null || true
    exit 1
  fi

  mkdir -p "$runtime_dir/.next"
  rm -rf "$runtime_dir/.next/static"
  cp -a "$APP_DIR/apps/web/.next/static" "$runtime_dir/.next/static"

  rm -rf "$runtime_dir/public"
  if [ -d "$APP_DIR/apps/web/public" ]; then
    cp -a "$APP_DIR/apps/web/public" "$runtime_dir/public"
  fi

  printf '%s' "$runtime_dir" > "$STATE_DIR/web-runtime-dir"
  log "Standalone web runtime prepared at ${runtime_dir#$APP_DIR/}"
}

start_or_restart_pm2_app() {
  local app_name="$1"
  if pm2 describe "$app_name" >/dev/null 2>&1; then
    pm2 restart "$app_name" --update-env
  else
    pm2 start ecosystem.config.cjs --only "$app_name" --update-env
  fi
}

mark_success() {
  printf '%s\n' "$NEW_SHA" > "$STATE_DIR/last-successful-sha"
  printf '%s\n' "$NEW_SHA" > "$STATE_DIR/last-processed-sha"
}

log "Go to app directory"
cd "$APP_DIR"
mkdir -p "$STATE_DIR" "$NPM_CACHE_DIR"

log "Runtime"
node -v
npm -v
docker --version
docker compose version
pm2 -v

log "Configure repository-specific Git authentication"
if [ ! -f "$DEPLOY_KEY" ]; then
  echo "ERROR: Repository deploy key not found: $DEPLOY_KEY"
  exit 1
fi
chmod 600 "$DEPLOY_KEY"
git remote set-url origin "$REPOSITORY_URL"
git config --local core.sshCommand "ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

CURRENT_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
LAST_SUCCESSFUL_SHA="$(cat "$STATE_DIR/last-successful-sha" 2>/dev/null || true)"
BASE_SHA="${LAST_SUCCESSFUL_SHA:-$CURRENT_SHA}"

log "Pull latest code"
git fetch origin main
git reset --hard origin/main
NEW_SHA="$(git rev-parse HEAD)"

if [ "$FORCE_FULL_DEPLOY" = "true" ] || [ "$FORCE_FULL_DEPLOY" = "1" ]; then
  log "Manual full deployment requested"
  FULL_VALIDATION=1
  BUILD_API=1
  BUILD_WEB=1
  BUILD_RUNNER=1
  SYNC_SCHEMA=1
  RECREATE_PM2=1
  RUNTIME_CHANGE=1
elif [ -n "$BASE_SHA" ] && git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null && git merge-base --is-ancestor "$BASE_SHA" "$NEW_SHA"; then
  mapfile -t CHANGED_FILES < <(git diff --name-only "$BASE_SHA" "$NEW_SHA")
else
  log "No usable successful deployment base was found; using a full deployment"
  FULL_VALIDATION=1
  BUILD_API=1
  BUILD_WEB=1
  BUILD_RUNNER=1
  SYNC_SCHEMA=1
  RECREATE_PM2=1
  RUNTIME_CHANGE=1
fi

if [ ${#CHANGED_FILES[@]} -gt 0 ]; then
  log "Changed files since ${BASE_SHA:0:12}"
  printf ' - %s\n' "${CHANGED_FILES[@]}"

  for file in "${CHANGED_FILES[@]}"; do
    case "$file" in
      package-lock.json)
        INSTALL_DEPS=1
        FULL_VALIDATION=1
        BUILD_API=1
        BUILD_WEB=1
        BUILD_RUNNER=1
        RECREATE_PM2=1
        RUNTIME_CHANGE=1
        ;;
      package.json)
        if root_package_runtime_changed "$BASE_SHA"; then
          FULL_VALIDATION=1
          BUILD_API=1
          BUILD_WEB=1
          BUILD_RUNNER=1
          RECREATE_PM2=1
          RUNTIME_CHANGE=1
        else
          log "Root package.json changed only in non-runtime metadata/scripts; dependency install is skipped"
        fi
        ;;
      apps/api/prisma/schema.prisma)
        SYNC_SCHEMA=1
        BUILD_API=1
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      apps/api/*)
        BUILD_API=1
        RUNTIME_CHANGE=1
        ;;
      apps/runner/*)
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      apps/web/*)
        BUILD_WEB=1
        RUNTIME_CHANGE=1
        ;;
      packages/shared/*)
        add_package_check packages/shared
        BUILD_API=1
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      packages/framework-detector/*)
        add_package_check packages/framework-detector
        BUILD_API=1
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      packages/workflow-parser/*)
        add_package_check packages/workflow-parser
        BUILD_API=1
        RUNTIME_CHANGE=1
        ;;
      packages/dns-provider-core/*)
        add_package_check packages/dns-provider-core
        BUILD_API=1
        RUNTIME_CHANGE=1
        ;;
      packages/dockerfile-generator/*)
        add_package_check packages/dockerfile-generator
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      ecosystem.config.cjs|scripts/deploy-vps.sh|infra/docker-compose.yml)
        RECREATE_PM2=1
        RUNTIME_CHANGE=1
        ;;
      .github/workflows/*|templates/github-actions/*|scripts/qa-*|docs/*|README*|*.md|.env.example|.gitignore|.gitattributes)
        ;;
      tsconfig.base.json)
        FULL_VALIDATION=1
        BUILD_API=1
        BUILD_WEB=1
        BUILD_RUNNER=1
        RUNTIME_CHANGE=1
        ;;
      *)
        log "Unknown changed path '$file'; choosing safe full validation"
        FULL_VALIDATION=1
        BUILD_API=1
        BUILD_WEB=1
        BUILD_RUNNER=1
        RECREATE_PM2=1
        RUNTIME_CHANGE=1
        ;;
    esac
  done
fi

if [ "$RUNTIME_CHANGE" -eq 0 ]; then
  log "No runtime-affecting files changed; build and restart are skipped"
  if curl -fsS --max-time 5 https://vps.techteamlead.com/api/health >/dev/null \
    && curl -fsSI --max-time 5 https://vps.techteamlead.com >/dev/null; then
    mark_success
    log "Fast no-op deployment completed"
    exit 0
  fi

  log "Live health check failed, switching to recovery deployment"
  RECREATE_PM2=1
  RUNTIME_CHANGE=1
fi

log "Validate server configuration"
test -f .env || { echo "ERROR: $APP_DIR/.env is missing"; exit 1; }
require_env DATABASE_URL
require_env REDIS_URL
require_env DEPLOY_OS_ENCRYPTION_KEY
require_env POSTGRES_ADMIN_URL
require_env RUNNER_DOCKER_NETWORK

cp .env apps/api/.env
cp .env apps/runner/.env

log "Start database services and runtime network"
docker compose -f infra/docker-compose.yml up -d postgres redis
RUNTIME_NETWORK="$(grep '^RUNNER_DOCKER_NETWORK=' .env | tail -n1 | cut -d= -f2-)"
docker network inspect "$RUNTIME_NETWORK" >/dev/null 2>&1 || docker network create "$RUNTIME_NETWORK"
wait_for_postgres
wait_for_redis

if [ ! -d node_modules ]; then
  INSTALL_DEPS=1
fi

if [ "$INSTALL_DEPS" -eq 1 ]; then
  log "Installing dependencies from package-lock.json with persistent local cache"
  npm ci --prefer-offline --no-audit --no-fund --cache "$NPM_CACHE_DIR"
else
  log "Dependency lockfile unchanged; npm install is skipped"
fi

if [ "$SYNC_SCHEMA" -eq 1 ] || [ "$INSTALL_DEPS" -eq 1 ]; then
  log "Prisma generate"
  npm run db:generate
fi

if [ "$SYNC_SCHEMA" -eq 1 ]; then
  log "Prisma schema sync"
  npm run db:push
fi

if [ "$RECREATE_PM2" -eq 1 ]; then
  [ -f apps/api/dist/main.js ] || BUILD_API=1
  [ -f apps/runner/dist/main.js ] || BUILD_RUNNER=1
  if [ ! -f apps/web/.next/standalone/apps/web/server.js ] && [ ! -f apps/web/.next/standalone/server.js ]; then
    BUILD_WEB=1
  fi
fi

if [ "$FULL_VALIDATION" -eq 1 ]; then
  log "Full typecheck and build"
  npm run typecheck
  npm run build
else
  for workspace in "${PACKAGE_CHECKS[@]:-}"; do
    [ -n "$workspace" ] || continue
    log "Typecheck affected workspace: $workspace"
    npm run typecheck -w "$workspace"
  done

  if [ "$BUILD_API" -eq 1 ]; then
    log "Typecheck and build API"
    npm run typecheck -w apps/api
    npm run build -w apps/api
  fi

  if [ "$BUILD_RUNNER" -eq 1 ]; then
    log "Typecheck and build Runner"
    npm run typecheck -w apps/runner
    npm run build -w apps/runner
  fi

  if [ "$BUILD_WEB" -eq 1 ]; then
    log "Typecheck and build Web"
    npm run typecheck -w apps/web
    npm run build -w apps/web
  fi
fi

if [ "$BUILD_WEB" -eq 1 ] || [ "$RECREATE_PM2" -eq 1 ]; then
  log "Prepare Next.js standalone runtime"
  prepare_standalone_web
fi

[ -f apps/api/dist/main.js ] || { echo "ERROR: API build output is missing"; exit 1; }
[ -f apps/runner/dist/main.js ] || { echo "ERROR: Runner build output is missing"; exit 1; }

unset RUNNER_TRACKING_ID
if [ "$RECREATE_PM2" -eq 1 ]; then
  log "Recreate Deploy OS PM2 processes with direct Node entrypoints"
  for app_name in "${PM2_APPS[@]}"; do
    pm2 delete "$app_name" >/dev/null 2>&1 || true
  done
  pm2 start ecosystem.config.cjs --update-env
else
  if [ "$BUILD_API" -eq 1 ]; then
    log "Restart API only"
    start_or_restart_pm2_app deploy-os-api
  fi
  if [ "$BUILD_WEB" -eq 1 ]; then
    log "Restart Web only"
    start_or_restart_pm2_app deploy-os-web
  fi
  if [ "$BUILD_RUNNER" -eq 1 ]; then
    log "Restart Runner only"
    start_or_restart_pm2_app deploy-os-runner
  fi
fi

if [ "$RECREATE_PM2" -eq 1 ] || [ "$BUILD_API" -eq 1 ]; then
  wait_for_service "Local API" "http://127.0.0.1:4000/api/health" deploy-os-api false 20
fi
if [ "$RECREATE_PM2" -eq 1 ] || [ "$BUILD_WEB" -eq 1 ]; then
  wait_for_service "Local Web" "http://127.0.0.1:3000" deploy-os-web true 20
fi
if [ "$RECREATE_PM2" -eq 1 ] || [ "$BUILD_API" -eq 1 ] || [ "$BUILD_WEB" -eq 1 ]; then
  wait_for_service "Live API" "https://vps.techteamlead.com/api/health" deploy-os-api false 20
fi

log "Save PM2 and deployment state"
pm2 save
mark_success

log "Deploy completed at $NEW_SHA"
