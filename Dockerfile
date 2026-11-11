# syntax=docker/dockerfile:1
# Builds both Linework images from the monorepo:
#   docker build --target web .   static site served by Caddy (also proxies /api)
#   docker build --target api .   live-collaboration relay

# The build stage runs on the build machine: its output is plain JavaScript, so
# multi-platform images need no emulated builds.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# Public origin written into /llms.txt links, e.g. https://linework.example.com
ARG LINEWORK_SITE_URL=""
ENV LINEWORK_SITE_URL=${LINEWORK_SITE_URL}
RUN pnpm --filter @linework/web build
RUN pnpm --filter @linework/api deploy --prod /out/api

FROM node:24-alpine AS api
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/main.ts"]

FROM caddy:2-alpine AS web
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
