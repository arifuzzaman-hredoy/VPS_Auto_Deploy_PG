const path = require('node:path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'deploy-os-api',
      cwd: root,
      script: 'npm',
      args: 'run start -w apps/api',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'deploy-os-web',
      cwd: root,
      script: 'npm',
      args: 'run start -w apps/web',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'deploy-os-runner',
      cwd: root,
      script: 'npm',
      args: 'run start -w apps/runner',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 30000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
