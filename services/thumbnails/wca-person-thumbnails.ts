import { LRUCache } from "lru-cache";
import type { WcaPersonResponse, WcaPersonSearchResponse } from "@/lib/data/types";
import type { PersonThumbnail, PersonThumbnailMap } from "@/services/thumbnails/types";

const thumbUrlCache = new LRUCache<string, PersonThumbnail>({
  maxSize: 64 * 1024 * 1024,
  sizeCalculation: (value, key) => Buffer.byteLength(key) + (value ? Buffer.byteLength(value) : 0),
});

export async function fetchPersonThumbnailsFromWca(
  search: string,
  personIds: string[],
  page: number,
  limit: number,
) {
  const response = await fetch(
    `https://www.worldcubeassociation.org/api/v0/search?q=${encodeURIComponent(search)}&page=${page}&per_page=${limit}`,
    {
      headers: { Accept: "application/json", "User-Agent": "WCA Rankings person search" },
      signal: AbortSignal.timeout(2500),
    },
  );
  if (!response.ok) return new Map<string, PersonThumbnail>();
  const body = (await response.json()) as WcaPersonSearchResponse;
  const thumbs: PersonThumbnailMap = new Map();
  for (const user of body.result ?? []) {
    if (user.class !== "person" || !user.wca_id) continue;
    const id = user.wca_id.toUpperCase();
    const thumb = user.avatar?.is_default
      ? null
      : (user.avatar?.thumb_url ?? user.avatar?.url ?? null);
    thumbUrlCache.set(id, thumb);
    thumbs.set(id, thumb);
  }
  const missingIds = personIds.filter((id) => !thumbs.has(id) && !thumbUrlCache.has(id));
  const queue = [...missingIds];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const personResponse = await fetch(
        `https://www.worldcubeassociation.org/api/v0/persons/${id}`,
        {
          headers: { Accept: "application/json", "User-Agent": "WCA Rankings person search" },
          signal: AbortSignal.timeout(2500),
        },
      );
      if (!personResponse.ok) continue;
      const detail = (await personResponse.json()) as WcaPersonResponse;
      const thumb = detail.person?.avatar?.is_default
        ? null
        : (detail.person?.avatar?.thumb_url ?? detail.person?.avatar?.url ?? null);
      thumbUrlCache.set(id, thumb);
      thumbs.set(id, thumb);
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(2, queue.length) }, worker));
  return thumbs;
}

export function getCachedPersonThumbnail(personId: string) {
  return thumbUrlCache.get(personId);
}
