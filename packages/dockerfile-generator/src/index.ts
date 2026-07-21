import type { FrameworkDetectionResult } from '@techteam/shared';

export type DockerfileOptions = {
  installCommand?: string | null;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
};

function shellJson(command: string): string {
  return JSON.stringify(['sh', '-lc', command]);
}

function commandWithBuildEnvironment(command: string): string {
  if (!command.trim()) return 'RUN true';

  const loader = [
    'const fs=require("node:fs")',
    'const cp=require("node:child_process")',
    'const env={...process.env}',
    'const file="/run/secrets/deploy_env"',
    'if(fs.existsSync(file)){Object.assign(env,JSON.parse(fs.readFileSync(file,"utf8")))}',
    'const result=cp.spawnSync("sh",["-lc",process.argv[1]],{stdio:"inherit",env})',
    'process.exit(result.status ?? 1)',
  ].join(';');

  return `RUN --mount=type=secret,id=deploy_env,required=false node -e ${JSON.stringify(loader)} ${JSON.stringify(command)}`;
}

export function generateDockerfile(plan: FrameworkDetectionResult, options: DockerfileOptions = {}): string {
  const port = options.port ?? plan.port;
  const installCommand = options.installCommand ?? plan.installCommand;
  const buildCommand = options.buildCommand ?? plan.buildCommand;
  const startCommand = options.startCommand ?? plan.startCommand;

  if (plan.framework === 'vite') return viteDockerfile(installCommand, buildCommand);
  if (plan.framework === 'static') return staticDockerfile();
  return nodeDockerfile(installCommand, buildCommand, startCommand, port);
}

function nodeDockerfile(installCommand: string, buildCommand: string, startCommand: string, port: number): string {
  return `# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY . .
${commandWithBuildEnvironment(installCommand)}
${commandWithBuildEnvironment(buildCommand)}

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${port}
RUN corepack enable
COPY --from=builder /app ./
EXPOSE ${port}
CMD ${shellJson(startCommand)}
`;
}

function viteDockerfile(installCommand: string, buildCommand: string): string {
  return `# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY . .
${commandWithBuildEnvironment(installCommand)}
${commandWithBuildEnvironment(buildCommand)}

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
`;
}

function staticDockerfile(): string {
  return `FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`;
}
