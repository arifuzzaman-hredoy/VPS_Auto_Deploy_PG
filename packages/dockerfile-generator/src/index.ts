import type { FrameworkDetectionResult } from '@techteam/shared';

export function generateDockerfile(plan: FrameworkDetectionResult): string {
  if (plan.framework === 'nextjs') return nextjsDockerfile();
  if (plan.framework === 'vite') return viteDockerfile();
  if (plan.framework === 'static') return staticDockerfile();
  return nodeDockerfile(plan.port);
}

function nextjsDockerfile(): string {
  return `FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
`;
}

function viteDockerfile(): string {
  return `FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

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

function nodeDockerfile(port: number): string {
  return `FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --if-present
EXPOSE ${port}
CMD ["npm", "run", "start"]
`;
}
