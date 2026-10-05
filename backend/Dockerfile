# Build context: raiz do projeto (inclui backend/ e frontend/).
# Nenhum segredo é necessário no build. Configure-os no Environment do EasyPanel.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production \
    PORT=3000 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=true

FROM base AS dependencies
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
# postinstall gera o Prisma Client sem conectar ao banco.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM base AS runtime
COPY --from=dependencies --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=dependencies --chown=node:node /app/backend/package.json /app/backend/package-lock.json ./
COPY --chown=node:node backend/prisma ./prisma
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts/healthcheck.js ./scripts/healthcheck.js
COPY --chown=node:node --chmod=755 backend/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chown=node:node frontend /app/frontend

USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["node", "scripts/healthcheck.js"]
ENTRYPOINT ["/usr/bin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
