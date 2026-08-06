import { createClient } from "redis";

const REDIS_KEY_VERSION = process.env.REDIS_CACHE_VERSION ?? "1";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

type RedisClient = ReturnType<typeof createClient>;

let clientPromise: Promise<RedisClient | null> | null = null;
let reportedFailure = false;

function cacheKey(key: string) {
  return `wca-rankings:v${REDIS_KEY_VERSION}:${key}`;
}

function reportFailure(error: unknown) {
  if (reportedFailure) return;
  reportedFailure = true;
  console.warn(
    "Redis cache unavailable; using the in-memory and database paths.",
    error,
  );
}

async function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!clientPromise) {
    const client = createClient({ url });
    client.on("error", reportFailure);
    clientPromise = client
      .connect()
      .then(() => client)
      .catch((error) => {
        reportFailure(error);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

export async function readRedisJson<T>(key: string): Promise<T | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    const value = await client.get(cacheKey(key));
    return value === null ? null : (JSON.parse(value) as T);
  } catch (error) {
    reportFailure(error);
    return null;
  }
}

export async function writeRedisJson(
  key: string,
  value: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  try {
    const client = await getClient();
    if (!client) return false;
    await client.set(cacheKey(key), JSON.stringify(value), {
      EX: ttlSeconds,
    });
    return true;
  } catch (error) {
    reportFailure(error);
    return false;
  }
}

export async function clearRedisCache() {
  try {
    const client = await getClient();
    if (!client) return false;
    const keys = client.scanIterator({
      MATCH: `wca-rankings:v${REDIS_KEY_VERSION}:*`,
      COUNT: 500,
    });
    const batch: string[] = [];
    for await (const key of keys) {
      batch.push(String(key));
      if (batch.length >= 500) {
        await Promise.all(batch.map((key) => client.del(key)));
        batch.length = 0;
      }
    }
    if (batch.length) await Promise.all(batch.map((key) => client.del(key)));
    return true;
  } catch (error) {
    reportFailure(error);
    return false;
  }
}
