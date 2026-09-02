FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl wget openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM runtime AS api
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @bolaocerto/api prisma:migrate && pnpm --filter @bolaocerto/api prisma:seed && node apps/api/dist/main.js"]

FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM runtime AS worker
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages
CMD ["node", "apps/worker/dist/main.js"]

# Imagem padrao para deploy por Dockerfile (Coolify, Railway, VPS etc.).
# Reune Web, API e worker no mesmo container; o PostgreSQL permanece externo.
FROM runtime AS production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_PORT=3000
ENV API_INTERNAL_URL=http://127.0.0.1:3001/api/v1
ENV API_PROXY_URL=http://127.0.0.1:3001
ENV API_PORT=3001

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
RUN pnpm install --prod --frozen-lockfile \
  --filter '@bolaocerto/api...' \
  --filter '@bolaocerto/worker...' \
  && rm -rf /root/.cache/pnpm /root/.local/share/pnpm /root/.pnpm-store /tmp/pnpm-store

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY docker/production-entrypoint.sh /usr/local/bin/bl-production-entrypoint
RUN chmod +x /usr/local/bin/bl-production-entrypoint

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/bl-production-entrypoint"]
