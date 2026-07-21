const path = require('node:path');

const root = __dirname;
const apiDir = path.join(root, 'apps', 'api');
const runnerDir = path.join(root, 'apps', 'runner');
const webDir = path.join(root, 'apps', 'web', '.next', 'standalone', 'apps', 'web');
const nodeInterpreter = process.execPath;

module.exports = {
  apps: [
    {
      name: 'deploy-os-api',
      cwd: apiDir,
      script: path.join(apiDir, 'dist', 'main.js'),
      interpreter: nodeInterpreter,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
        API_HOST: '0.0.0.0',
        API_PORT: '4000',
      },
    },
    {
      name: 'deploy-os-web',
      cwd: webDir,
      script: path.join(webDir, 'server.js'),
      interpreter: nodeInterpreter,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 10000,
      max_memory_restart: '768M',
      time: true,
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '0.0.0.0',
        PORT: '3000',
      },
    },
    {
      name: 'deploy-os-runner',
      cwd: runnerDir,
      script: path.join(runnerDir, 'dist', 'main.js'),
      interpreter: nodeInterpreter,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 30000,
      max_memory_restart: '768M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
