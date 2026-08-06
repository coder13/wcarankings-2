import { clearRedisCache } from "../services/cache/redis";

const cleared = await clearRedisCache();

if (!cleared && process.env.REDIS_URL) {
  throw new Error("Redis cache could not be cleared.");
}

process.stdout.write(
  cleared
    ? "Redis cache cleared.\n"
    : "Redis is not configured; no cache was cleared.\n",
);
