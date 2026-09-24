# Kairos Coach — API + web from a single container (decision D-08).
# Build:  docker build -t kairos .
# Run:    docker run -p 8787:8787 -e DATABASE_URL=... kairos
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
# Only what the server and the web app need (not the desktop app).
RUN pnpm install --frozen-lockfile --filter "@coach/api..." --filter "@coach/web..."
RUN pnpm --filter @coach/web build

FROM base AS run
ENV NODE_ENV=production \
    WEB_DIST=/app/apps/web/dist \
    PORT=8787
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@coach/api", "start"]
