# Render demo only: same build as apps/web/Dockerfile, but nginx forwards /api to the API
# service named by the API_HOST environment variable (see infra/render/nginx.conf.template).
# Build from the repo root: docker build -f infra/render/web.Dockerfile .
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter @erp/web...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @erp/types build
RUN pnpm --filter @erp/web build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/render/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
