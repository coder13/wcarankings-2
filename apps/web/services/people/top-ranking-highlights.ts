import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  type QueryTimings,
} from "@/lib/api/projection";
import { WCA_EVENTS, type GenderFilter, type RankingType } from "@/lib/wca";
import { rankingsWindowCache } from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";

const TOP_RANK = 5;
const PAGE_SIZE = 5;
const MAX_SHOWN_STATS = 200;

type Scope = "world" | "continent" | "country";

export type TopRankingHighlightSourceRow = {
  event_id: string;
  result_type: RankingType;
  gender: GenderFilter;
  country_id: string;
  continent_id: string;
  country_name: string;
  continent_name: string;
  competition_year: number | null;
  world_rank: number;
  continent_rank: number;
  country_rank: number;
};

type HighlightCandidate = {
  id: string;
  eventId: string;
  resultType: RankingType;
  scope: Scope;
  regionId: string;
  regionName: string;
  gender: GenderFilter | null;
  year: number | null;
  baseRank: number;
};

type TopRankingHighlight = {
  id: string;
  title: string;
  eventId: string;
  resultType: RankingType;
  scope: Scope;
  regionId: string;
  gender: GenderFilter | null;
  year: number | null;
  entries: RankingEntry[];
};

type HighlightsInput = {
  cursor: number;
  shown: Set<string>;
};

const WCA_ID_PATTERN = /^\d{4}[A-Z]{4}\d{2}$/;

export function parseTopRankingHighlightsPersonId(personId: string) {
  const normalized = personId.trim().toUpperCase();
  if (!WCA_ID_PATTERN.test(normalized)) {
    throw new ApiInputError("wcaId must be a valid WCA ID.");
  }
  return normalized;
}

function parseInput(params: URLSearchParams): HighlightsInput {
  const cursor = Number(params.get("cursor") ?? "0");
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new ApiInputError("cursor must be a non-negative integer.");
  }

  const shown = new Set(params.getAll("shown").filter(Boolean));
  if (shown.size > MAX_SHOWN_STATS) {
    throw new ApiInputError(
      `shown must contain at most ${MAX_SHOWN_STATS} stats.`,
    );
  }
  return { cursor, shown };
}

function topRankingHighlightCandidatesQuery() {
  return `SELECT ranking.event_id, ranking.result_type, ranking.gender,
      COALESCE(ranking.country_id, '') AS country_id,
      COALESCE(ranking.continent_id, '') AS continent_id,
      COALESCE(country.name, ranking.country_id, '') AS country_name,
      COALESCE(continent.name, ranking.continent_id, '') AS continent_name,
      facts.competition_year,
      ranking.world_rank, ranking.continent_rank, ranking.country_rank
    FROM person_event_rankings ranking
    LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
    LEFT JOIN countries country ON country.id = ranking.country_id
    LEFT JOIN continents continent ON continent.id = ranking.continent_id
    WHERE ranking.person_id = ?
      AND (ranking.world_rank <= ${TOP_RANK}
        OR ranking.continent_rank <= ${TOP_RANK}
        OR ranking.country_rank <= ${TOP_RANK})`;
}

function rankForScope(row: TopRankingHighlightSourceRow, scope: Scope) {
  if (scope === "continent") return Number(row.continent_rank);
  if (scope === "country") return Number(row.country_rank);
  return Number(row.world_rank);
}

function scopeDetails(row: TopRankingHighlightSourceRow, scope: Scope) {
  if (scope === "continent") {
    return { regionId: row.continent_id, regionName: row.continent_name };
  }
  if (scope === "country") {
    return { regionId: row.country_id, regionName: row.country_name };
  }
  return { regionId: "", regionName: "World" };
}

function candidateId(candidate: Omit<HighlightCandidate, "id">) {
  return [
    candidate.eventId,
    candidate.resultType,
    candidate.scope,
    candidate.regionId,
    candidate.gender ?? "all",
    candidate.year ?? "all",
  ].join(":");
}

function candidateTitle(candidate: HighlightCandidate) {
  const event = WCA_EVENTS.find((item) => item.id === candidate.eventId);
  const parts = [
    `Top ${event?.name ?? candidate.eventId} ${candidate.resultType === "single" ? "Single" : "Average"}`,
    candidate.regionName,
  ];
  if (candidate.gender === "f") parts.push("Female");
  if (candidate.gender === "m") parts.push("Male");
  if (candidate.gender === "o") parts.push("Other");
  if (candidate.year !== null) parts.push(String(candidate.year));
  return parts.join(" · ");
}

function candidateVariants(row: TopRankingHighlightSourceRow) {
  const candidates: HighlightCandidate[] = [];
  const scopes: Scope[] = ["world", "continent", "country"];
  const variants = [
    { gender: null, year: null },
    { gender: row.gender, year: null },
    { gender: null, year: row.competition_year },
    { gender: row.gender, year: row.competition_year },
  ] as const;

  for (const scope of scopes) {
    const baseRank = rankForScope(row, scope);
    const { regionId, regionName } = scopeDetails(row, scope);
    if (baseRank > TOP_RANK || (scope !== "world" && !regionId)) continue;

    for (const variant of variants) {
      if (variant.year !== null && variant.year < 1982) continue;
      const candidateWithoutId = {
        eventId: row.event_id,
        resultType: row.result_type,
        scope,
        regionId,
        regionName,
        gender: variant.gender,
        year: variant.year,
        baseRank,
      };
      candidates.push({
        ...candidateWithoutId,
        id: candidateId(candidateWithoutId),
      });
    }
  }
  return candidates;
}

export function orderTopRankingHighlightCandidates(
  rows: readonly TopRankingHighlightSourceRow[],
) {
  const unique = new Map<string, HighlightCandidate>();
  for (const row of rows) {
    for (const candidate of candidateVariants(row)) {
      const existing = unique.get(candidate.id);
      if (!existing || candidate.baseRank < existing.baseRank) {
        unique.set(candidate.id, candidate);
      }
    }
  }

  const byEvent = new Map<string, HighlightCandidate[]>();
  for (const candidate of unique.values()) {
    const group = byEvent.get(candidate.eventId) ?? [];
    group.push(candidate);
    byEvent.set(candidate.eventId, group);
  }
  for (const group of byEvent.values()) {
    group.sort(
      (left, right) =>
        left.baseRank - right.baseRank ||
        Number(left.year !== null) - Number(right.year !== null) ||
        Number(left.gender !== null) - Number(right.gender !== null) ||
        left.resultType.localeCompare(right.resultType),
    );
  }

  const ordered: HighlightCandidate[] = [];
  while (byEvent.size) {
    const groups = [...byEvent.entries()].sort(([eventId], [otherEventId]) =>
      eventId.localeCompare(otherEventId),
    );
    for (const [eventId, group] of groups) {
      const next = group.shift();
      if (next) ordered.push(next);
      if (group.length === 0) byEvent.delete(eventId);
    }
  }
  return ordered;
}

function rankingParams(candidate: HighlightCandidate) {
  const params = new URLSearchParams({
    eventId: candidate.eventId,
    result: candidate.resultType,
  });
  if (candidate.scope !== "world") params.set("region", candidate.regionId);
  if (candidate.gender !== null) params.set("gender", candidate.gender);
  if (candidate.year !== null) params.set("year", String(candidate.year));
  return params;
}

async function loadHighlight(personId: string, candidate: HighlightCandidate) {
  const locateParams = rankingParams(candidate);
  locateParams.set("locate", personId);
  const locatedResult = await loadRankingsWithDiagnostics(locateParams);
  const located = (locatedResult.data as { located?: RankingEntry | null })
    .located;
  if (!located || located.rank > TOP_RANK) return null;

  const pageParams = rankingParams(candidate);
  pageParams.set("start", String(Math.max(1, located.subRank - 2)));
  pageParams.set("limit", String(PAGE_SIZE));
  const pageResult = await loadRankingsWithDiagnostics(pageParams);
  const entries = (pageResult.data as { entries?: RankingEntry[] }).entries;
  if (!entries) return null;

  return {
    highlight: {
      id: candidate.id,
      title: candidateTitle(candidate),
      eventId: candidate.eventId,
      resultType: candidate.resultType,
      scope: candidate.scope,
      regionId: candidate.regionId,
      gender: candidate.gender,
      year: candidate.year,
      entries: entries.slice(0, PAGE_SIZE),
    } satisfies TopRankingHighlight,
    timings: addTimings(locatedResult.timings, pageResult.timings),
    queryCount: locatedResult.queryCount + pageResult.queryCount,
    returnedRows: locatedResult.returnedRows + pageResult.returnedRows,
  };
}

async function loadUncached(personId: string, input: HighlightsInput) {
  const source = await query<TopRankingHighlightSourceRow>(
    topRankingHighlightCandidatesQuery(),
    [personId],
  );
  const candidates = orderTopRankingHighlightCandidates(source.rows);
  const highlights: TopRankingHighlight[] = [];
  let timings: QueryTimings = source.timings;
  let queryCount = 1;
  let returnedRows = source.rowCount;
  let cursor = input.cursor;

  while (cursor < candidates.length && highlights.length < PAGE_SIZE) {
    const candidate = candidates[cursor++];
    if (input.shown.has(candidate.id)) continue;
    const loaded = await loadHighlight(personId, candidate);
    if (!loaded) continue;
    highlights.push(loaded.highlight);
    timings = addTimings(timings, loaded.timings);
    queryCount += loaded.queryCount;
    returnedRows += loaded.returnedRows;
  }

  return {
    data: {
      entries: highlights,
      nextCursor: cursor < candidates.length ? cursor : null,
      hasMore: cursor < candidates.length,
    },
    diagnostics: { timings, queryCount, returnedRows },
  };
}

type TopRankingHighlightsCacheValue = Awaited<ReturnType<typeof loadUncached>>;

function isTopRankingHighlightsCacheValue(
  value: Record<string, unknown>,
): value is TopRankingHighlightsCacheValue {
  if (
    !("data" in value) ||
    typeof value.data !== "object" ||
    !value.data ||
    !("diagnostics" in value) ||
    typeof value.diagnostics !== "object" ||
    !value.diagnostics
  ) {
    return false;
  }
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "hasMore" in value.data &&
    typeof value.data.hasMore === "boolean" &&
    "timings" in value.diagnostics &&
    typeof value.diagnostics.timings === "object" &&
    value.diagnostics.timings !== null
  );
}

function cacheKey(
  personId: string,
  input: HighlightsInput,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    ranking: "person-top-ranking-highlights",
    personId,
    cursor: input.cursor,
    shown: [...input.shown].sort(),
  });
}

export async function loadTopRankingHighlights(
  personId: string,
  params: URLSearchParams,
) {
  const normalizedPersonId = parseTopRankingHighlightsPersonId(personId);
  const input = parseInput(params);
  const metadata = await getCurrentRankingsMetadata();
  const cached = await rankingsWindowCache.getWithStatus(
    cacheKey(normalizedPersonId, input, metadata.fetchedAt),
    async () => ({ ...(await loadUncached(normalizedPersonId, input)) }),
  );
  if (!isTopRankingHighlightsCacheValue(cached.value)) {
    throw new Error("The top ranking highlights cache returned invalid data.");
  }

  return {
    ...cached.value,
    diagnostics: {
      ...cached.value.diagnostics,
      timings:
        cached.outcome === "hit"
          ? { queueMs: 0, statementMs: 0 }
          : cached.value.diagnostics.timings,
      cacheOutcome: cached.outcome,
      cacheLayer: "memory" as const,
    },
  };
}
