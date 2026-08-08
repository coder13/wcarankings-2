FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build \
  && pnpm --filter @wcarankings/web deploy --legacy --prod /app/web-runtime \
  && pnpm prune --prod --config.confirmModulesPurge=false \
  && pnpm store prune

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN useradd --system --uid 10001 --create-home app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
# BullMQ loads ioredis at runtime. Vinext includes BullMQ in its standalone
# output, but does not trace this peer dependency. The deployed web dependency
# tree supplies BullMQ and ioredis with their full production dependencies.
COPY --from=build --chown=app:app /app/web-runtime/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/web/dist/standalone ./dist/standalone
COPY --from=build --chown=app:app /app/apps/web/dist/client ./dist/client
# Vinext's standalone SSR resolves client manifests relative to its server bundle.
COPY --from=build --chown=app:app /app/apps/web/dist/client ./dist/standalone/dist/client
COPY --from=build --chown=app:app /app/release-compatibility.json ./release-compatibility.json
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

USER app

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/standalone/server.js"]
