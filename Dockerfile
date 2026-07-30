FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN useradd --system --uid 10001 --create-home app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends mariadb-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist/standalone ./dist/standalone
COPY --from=build --chown=app:app /app/dist/client ./dist/client
# Vinext's standalone SSR resolves client manifests relative to its server bundle.
COPY --from=build --chown=app:app /app/dist/client ./dist/standalone/dist/client
COPY --from=build --chown=app:app /app/sql ./sql
COPY --from=build --chown=app:app /app/scripts/backfill-result-entries.mjs ./scripts/backfill-result-entries.mjs
COPY --from=build --chown=app:app /app/scripts/backfill-result-rankings.mjs ./scripts/backfill-result-rankings.mjs
COPY --from=build --chown=app:app /app/scripts/backfill-person-year-rankings.mjs ./scripts/backfill-person-year-rankings.mjs
COPY --from=build --chown=app:app /app/scripts/backfill-sum-of-ranks.mjs ./scripts/backfill-sum-of-ranks.mjs
COPY --from=build --chown=app:app /app/scripts/mysql-schema.mjs ./scripts/mysql-schema.mjs
COPY --from=build --chown=app:app /app/scripts/refresh-rankings.mjs ./scripts/refresh-rankings.mjs
COPY --from=build --chown=app:app /app/scripts/refresh-system-lists.mjs ./scripts/refresh-system-lists.mjs
COPY --from=build --chown=app:app /app/scripts/system-list-definitions.mjs ./scripts/system-list-definitions.mjs
COPY --from=build --chown=app:app /app/scripts/check-ranking-projections.mjs ./scripts/check-ranking-projections.mjs
COPY --from=build --chown=app:app /app/scripts/publish-projection-transfer.mjs ./scripts/publish-projection-transfer.mjs
COPY --from=build --chown=app:app /app/scripts/projection-transfer-date.mjs ./scripts/projection-transfer-date.mjs
COPY --from=build --chown=app:app /app/scripts/sync-wca-export.mjs ./scripts/sync-wca-export.mjs
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /var/cache/wcarankings && chown app:app /var/cache/wcarankings

USER app

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/standalone/server.js"]
