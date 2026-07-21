import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ecosystem = readFileSync(join(root, 'ecosystem.config.cjs'), 'utf8');
const deployScript = readFileSync(join(root, 'scripts/deploy-vps.sh'), 'utf8');
const compose = readFileSync(join(root, 'infra/docker-compose.yml'), 'utf8');

assert.ok(ecosystem.includes("dist', 'main.js"), 'API/runner must use compiled Node entrypoints');
assert.ok(ecosystem.includes("standalone', 'apps', 'web"), 'Web must use Next.js standalone runtime');
assert.ok(ecosystem.includes("script: path.join(webDir, 'server.js')"), 'Standalone server.js entrypoint is missing');
assert.ok(!ecosystem.includes("script: 'npm'"), 'PM2 must not execute npm wrappers');
assert.ok(!ecosystem.includes("args: 'run start"), 'PM2 must not retain stale npm run arguments');

assert.ok(deployScript.includes('wait_for_postgres'), 'PostgreSQL readiness check is missing');
assert.ok(deployScript.includes('wait_for_redis'), 'Redis readiness check is missing');
assert.ok(deployScript.includes('prepare_standalone_web'), 'Standalone asset preparation is missing');
assert.ok(deployScript.includes('pm2 delete "$app_name"'), 'Stale PM2 process definitions are not removed');
assert.ok(deployScript.includes('pm2 start ecosystem.config.cjs --update-env'), 'Fresh PM2 start is missing');
assert.ok(!deployScript.includes('pm2 startOrReload'), 'startOrReload can preserve stale execution metadata');

assert.ok(compose.includes('restart: unless-stopped'), 'Containers need restart policies');
assert.ok(compose.includes('healthcheck:'), 'Container health checks are missing');

console.log('Hredoy Deploy OS PM2/runtime QA passed.');
