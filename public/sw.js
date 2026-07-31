const SHELL_CACHE = "wca-rankings-shell-v4";
const RANKINGS_CACHE = "wca-rankings-pages-v3";
// Kept as a compatibility name for existing service-worker checks and diagnostics.
const CACHE_NAME = SHELL_CACHE;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

function isRankingPage(url) {
  if (url.pathname !== "/api/rankings" || url.searchParams.get("paged") !== "1") return false;
  return !["search", "locate", "cursorRank", "cursorId"].some((key) => url.searchParams.has(key));
}

function eventIdFor(request) {
  return new URL(request.url).searchParams.get("eventId") || new URL(request.url).searchParams.get("event") || "333";
}

async function withCacheMetadata(response, extraHeaders = {}, cachedAt = Date.now()) {
  const headers = new Headers(response.headers);
  headers.set("X-Rankings-Cached-At", String(cachedAt));
  headers.set("X-Rankings-Last-Used", String(Date.now()));
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
}

async function enforceRankingLimit(cache, eventId) {
  const requests = (await cache.keys()).filter((request) => eventIdFor(request) === eventId);
  const capacity = eventId === "333" ? 512 : 128;
  if (requests.length <= capacity) return;
  const entries = await Promise.all(requests.map(async (request) => ({
    request,
    response: await cache.match(request),
  })));
  entries.filter(({ request }) => {
    const url = new URL(request.url);
    return !(url.searchParams.get("start") === "0" && !url.searchParams.has("region"));
  }).sort((left, right) =>
    Number(left.response?.headers.get("X-Rankings-Last-Used") || 0)
      - Number(right.response?.headers.get("X-Rankings-Last-Used") || 0),
  );
  await Promise.all(entries.slice(0, Math.max(0, requests.length - capacity)).map(({ request }) => cache.delete(request)));
}

async function cachedRankingPage(request) {
  const cache = await caches.open(RANKINGS_CACHE);
  const cached = await cache.match(request);
  if (!cached) return null;
  const cachedAt = Number(cached.headers.get("X-Rankings-Cached-At") || 0);
  const expired = Date.now() - cachedAt > MAX_AGE_MS;
  await cache.put(request, await withCacheMetadata(cached, {
    "X-Rankings-Offline-Stale": "1",
    "X-Rankings-Expired": expired ? "1" : "0",
  }, cachedAt));
  return new Response(await cached.blob(), {
    status: cached.status,
    statusText: cached.statusText,
    headers: (() => {
      const headers = new Headers(cached.headers);
      // Network is unavailable; even a fresh cache can lag the published import.
      headers.set("X-Rankings-Offline-Stale", "1");
      return headers;
    })(),
  });
}

async function fetchAndCache(request, cache, cacheKey = request) {
  const response = await fetch(request);
  if (response.ok) await cache.put(cacheKey, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("wca-rankings-") && key !== SHELL_CACHE && key !== RANKINGS_CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isRankingPage(url)) {
    const refresh = caches.open(RANKINGS_CACHE).then((cache) => fetch(request).then(async (response) => {
        if (response.ok) {
          await cache.put(request, await withCacheMetadata(response.clone()));
          await enforceRankingLimit(cache, eventIdFor(request));
        }
        return response;
      }));
    event.waitUntil(refresh.catch(() => undefined));
    event.respondWith(caches.open(RANKINGS_CACHE).then(async (cache) =>
      (await cache.match(request)) || refresh.catch(async () => (await cachedRankingPage(request)) || Response.error()),
    ));
    return;
  }

  if (request.destination === "document") {
    const refresh = caches.open(SHELL_CACHE).then((cache) => fetchAndCache(request, cache, "/"));
    event.waitUntil(refresh.catch(() => undefined));
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) =>
      (await cache.match("/")) || refresh.catch(() => Response.error()),
    ));
    return;
  }

  if (["script", "style", "image", "font"].includes(request.destination)) {
    const refresh = caches.open(SHELL_CACHE).then((cache) => fetchAndCache(request, cache));
    event.waitUntil(refresh.catch(() => undefined));
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) =>
      (await cache.match(request)) || refresh,
    ));
  }
});
