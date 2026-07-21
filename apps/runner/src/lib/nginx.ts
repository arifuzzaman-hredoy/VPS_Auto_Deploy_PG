import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './shell.js';

function safeSlug(value: string): string {
  if (!/^[a-z0-9-]+$/.test(value)) throw new Error('Unsafe project slug for Nginx configuration.');
  return value;
}

function safeHostname(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^(?:\*\.)?(?!-)(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(normalized)) {
    throw new Error(`Invalid route hostname: ${value}`);
  }
  return normalized;
}

export type NginxRouteHandle = {
  hostname: string;
  sslActive: boolean;
  rollback: () => Promise<void>;
};

async function reloadNginx(): Promise<void> {
  await runCommand('nginx', ['-t'], { timeoutMs: 30_000 });
  await runCommand('systemctl', ['reload', 'nginx'], { timeoutMs: 30_000 });
}

export async function activateNginxRoute(input: { slug: string; hostname: string; hostPort: number }): Promise<NginxRouteHandle> {
  if ((process.env.RUNNER_NGINX_ENABLED ?? 'true').toLowerCase() !== 'true') {
    return { hostname: input.hostname, sslActive: false, rollback: async () => undefined };
  }

  const slug = safeSlug(input.slug);
  const hostname = safeHostname(input.hostname);
  const availableDir = process.env.RUNNER_NGINX_AVAILABLE_DIR ?? '/etc/nginx/sites-available';
  const enabledDir = process.env.RUNNER_NGINX_ENABLED_DIR ?? '/etc/nginx/sites-enabled';
  mkdirSync(availableDir, { recursive: true });
  mkdirSync(enabledDir, { recursive: true });

  const filename = `hredoy-deploy-${slug}.conf`;
  const availablePath = join(availableDir, filename);
  const enabledPath = join(enabledDir, filename);
  const previousConfig = existsSync(availablePath) ? readFileSync(availablePath, 'utf8') : null;
  const previousEnabled = existsSync(enabledPath);
  let rollbackCompleted = false;

  const rollback = async () => {
    if (rollbackCompleted) return;
    rollbackCompleted = true;

    if (previousConfig === null) {
      if (existsSync(enabledPath)) unlinkSync(enabledPath);
      if (existsSync(availablePath)) unlinkSync(availablePath);
    } else {
      writeFileSync(availablePath, previousConfig, { mode: 0o644 });
      if (previousEnabled && !existsSync(enabledPath)) {
        await runCommand('ln', ['-s', availablePath, enabledPath]);
      }
      if (!previousEnabled && existsSync(enabledPath)) unlinkSync(enabledPath);
    }

    await reloadNginx();
  };

  const config = `server {
    listen 80;
    listen [::]:80;
    server_name ${hostname};

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:${input.hostPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
`;

  writeFileSync(availablePath, config, { mode: 0o644 });
  if (existsSync(enabledPath)) unlinkSync(enabledPath);
  await runCommand('ln', ['-s', availablePath, enabledPath]);

  try {
    await reloadNginx();

    const autoSsl = (process.env.RUNNER_AUTO_SSL ?? 'false').toLowerCase() === 'true';
    const email = process.env.RUNNER_SSL_EMAIL?.trim();
    let sslActive = false;

    if (autoSsl && email && !hostname.startsWith('*.')) {
      await runCommand('certbot', [
        '--nginx', '-d', hostname,
        '--non-interactive', '--agree-tos', '--redirect',
        '--email', email,
      ], { timeoutMs: 180_000 });
      sslActive = true;
    }

    return { hostname, sslActive, rollback };
  } catch (error) {
    await rollback().catch(() => undefined);
    throw error;
  }
}
