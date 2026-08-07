# Redis ranking cache

The app uses Redis as an optional second cache for ranking data and feed stat
previews.

## Cache order

The normal read order is:

1. The process-local LRU cache.
2. Redis.
3. MariaDB.

The current ranking window is 400 rows. Redis stores this window as eight
50-row pages. Feed stat previews use 50-row source pages. This keeps Redis
reads small and lets the server reuse pages when it prepares more than one
client page.

Redis entries expire after 24 hours. Cloudflare can still use its separate
one-hour response cache.

## Failure behavior

Redis is a cache only. A connection, read, write, or JSON error is logged once
and the request continues with the local cache and database path. Redis must
never make a feed or stat unavailable.

The key prefix includes `REDIS_CACHE_VERSION`. Increase this value after a
projection deploy when old cached results must not be used. The explicit reset
command is:

```sh
pnpm run cache:clear-redis
```

The command is safe when Redis is not configured. The Compose Redis service is
cache-only and has no persistent volume.

## Worker seeding

The background worker builds feed rows at startup. After that work completes,
it reads the stored feed items one at a time and seeds the Redis source pages.
This keeps the first feed request from having to calculate every stat preview.

The worker does not store feed snapshots in Redis. MariaDB remains the source
for feed item discovery, and Redis stores computed ranking pages.
