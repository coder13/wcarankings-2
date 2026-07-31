import { query } from "@/db";
import { ApiInputError } from "@/lib/projection-api";
import { isValidRegexPattern } from "@/lib/wca";
import { LRUCache } from "lru-cache";

type PersonIdRow = { wca_id: string };
type PersonSearchRow = {
  wca_id: string;
  name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  avatar_url: string | null;
  competition_count: number;
  total_count: number;
};

const thumbUrlCache = new LRUCache<string, string | null>({
  maxSize: 64 * 1024 * 1024,
  sizeCalculation: (value, key) => Buffer.byteLength(key) + (value ? Buffer.byteLength(value) : 0),
});

export async function fetchWcaThumbs(search: string, personIds: string[], page = 1, limit = 10) {
  const response = await fetch(`https://www.worldcubeassociation.org/api/v0/search?q=${encodeURIComponent(search)}&page=${page}&per_page=${limit}`, {
    headers: { Accept: "application/json", "User-Agent": "WCA Rankings person search" },
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return new Map<string, string | null>();
  const body = await response.json() as { result?: Array<{ wca_id?: string; class?: string; avatar?: { thumb_url?: string; url?: string; is_default?: boolean } }> };
  const thumbs = new Map<string, string | null>();
  for (const user of body.result ?? []) {
    if (user.class !== "person" || !user.wca_id) continue;
    const id = user.wca_id.toUpperCase();
    const thumb = user.avatar?.is_default ? null : user.avatar?.thumb_url ?? user.avatar?.url ?? null;
    thumbUrlCache.set(id, thumb);
    thumbs.set(id, thumb);
  }
  const missingIds = personIds.filter((id) => !thumbs.has(id) && !thumbUrlCache.has(id));
  const queue = [...missingIds];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const personResponse = await fetch(`https://www.worldcubeassociation.org/api/v0/persons/${id}`, {
        headers: { Accept: "application/json", "User-Agent": "WCA Rankings person search" },
        signal: AbortSignal.timeout(2500),
      });
      if (!personResponse.ok) continue;
      const detail = await personResponse.json() as { person?: { avatar?: { thumb_url?: string; url?: string; is_default?: boolean } } };
      const thumb = detail.person?.avatar?.is_default ? null : detail.person?.avatar?.thumb_url ?? detail.person?.avatar?.url ?? null;
      thumbUrlCache.set(id, thumb);
      thumbs.set(id, thumb);
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(2, queue.length) }, worker));
  return thumbs;
}

function escapeLikePrefix(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchPersonIds(search: string, regexSearch: boolean, limit: number) {
  if (regexSearch && !isValidRegexPattern(search)) throw new Error("Invalid regular expression.");

  const nameCondition = regexSearch ? "name REGEXP ?" : "name LIKE ? ESCAPE '\\\\'";
  const namePattern = regexSearch ? search : `${escapeLikePrefix(search)}%`;
  const result = await query<PersonIdRow>(
    `SELECT wca_id FROM persons
     WHERE sub_id = 1
       AND (wca_id = ? OR ${nameCondition})
     ORDER BY (wca_id = ?) DESC, name, wca_id
     LIMIT ?`,
    [search.toUpperCase(), namePattern, search.toUpperCase(), limit],
  );

  return {
    personIds: result.rows.map((row) => row.wca_id),
    timings: result.timings,
    returnedRows: result.rows.length,
  };
}

export async function loadPersonSearchParts(params: URLSearchParams) {
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  if (!search) throw new ApiInputError("q is required.");
  const mode = params.get("mode") ?? "prefix";
  if (mode !== "prefix" && mode !== "regex") throw new ApiInputError("mode must be prefix or regex.");
  if (mode === "regex" && !isValidRegexPattern(search)) throw new ApiInputError("Invalid regular expression.");
  const rawLimit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    throw new ApiInputError("limit must be between 1 and 50.");
  }
  const rawOffset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(rawOffset) || rawOffset < 0) throw new ApiInputError("offset must be a non-negative integer.");
  const nameCondition = mode === "regex" ? "person.name REGEXP ?" : "person.name LIKE ? ESCAPE '\\\\'";
  const namePattern = mode === "regex" ? search : `${escapeLikePrefix(search)}%`;
  const result = await query<PersonSearchRow>(
    `SELECT person.wca_id, person.name, person.country_id, user.avatar_url,
       COUNT(*) OVER() AS total_count,
       COALESCE(competition_counts.competition_count, 0) AS competition_count,
       COALESCE(country.name, person.country_id) AS country_name,
       COALESCE(country.iso2, '') AS country_iso2
     FROM persons person
     LEFT JOIN countries country ON country.id = person.country_id
     LEFT JOIN app_users user ON user.wca_id = person.wca_id
     LEFT JOIN (SELECT person_id, COUNT(DISTINCT competition_id) AS competition_count FROM results GROUP BY person_id) competition_counts ON competition_counts.person_id = person.wca_id
     WHERE person.sub_id = 1
       AND (person.wca_id LIKE ? ESCAPE '\\\\' OR ${nameCondition})
     ORDER BY (person.wca_id = ?) DESC, person.name, person.wca_id
     LIMIT ?, ?`,
      [`${escapeLikePrefix(search.toUpperCase())}%`, namePattern, search.toUpperCase(), rawOffset, rawLimit],
  );
  const personIds = result.rows.map((row) => row.wca_id);
  const thumbsPromise = fetchWcaThumbs(search, personIds, Math.floor(rawOffset / rawLimit) + 1, rawLimit).catch(() => new Map<string, string | null>());
  return {
    thumbs: thumbsPromise.then((thumbs) => Object.fromEntries(thumbs)),
    payload: {
    data: {
      entries: result.rows.map((row) => ({
        personId: row.wca_id,
        name: row.name,
        avatarUrl: thumbUrlCache.get(row.wca_id) ?? row.avatar_url,
        competitionCount: Number(row.competition_count),
        country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
      })),
      context: { resource: "person-search", query: search, mode },
      page: { limit: rawLimit, hasMore: result.rows.length === rawLimit, next: null },
      total: Number(result.rows[0]?.total_count ?? 0),
    },
    diagnostics: { timings: result.timings, queryCount: 2, returnedRows: result.rows.length },
    },
  };
}

export async function loadPersonSearch(params: URLSearchParams) {
  const parts = await loadPersonSearchParts(params);
  const thumbs = await parts.thumbs;
  return { ...parts.payload, data: { ...parts.payload.data, entries: parts.payload.data.entries.map((entry) => ({ ...entry, avatarUrl: thumbs[entry.personId] ?? entry.avatarUrl })) } };
}
