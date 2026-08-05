import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseGender,
  parseLimit,
  parseScope,
  parseStart,
  parseYear,
} from "@/lib/api/projection";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { sqlFragment } from "@/lib/helpers/database/sql";
import {
  isMedalRankingType,
  type MedalRankingType,
} from "@/lib/medal-rankings";
import type { GenderFilter, RegionScope } from "@/lib/wca";
import type { QueryTimings } from "@/lib/api/projection";

const medalCountFormatter = new Intl.NumberFormat("en-US");

type MedalType = MedalRankingType;

type MedalInput = {
  eventId: string | null;
  medalType: MedalType;
  scope: RegionScope;
  regionId: string;
  gender: readonly GenderFilter[];
  year: number | null;
  start: number;
  limit: number;
};

type MedalRow = {
  rank: number;
  position: number;
  total_count?: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  medal_count: number;
};

type MedalEntry = ReturnType<typeof toEntry>;
type MedalWindow = {
  data: { entries: MedalEntry[]; total: number };
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
};

function isMedalType(value: string | null): value is MedalType {
  return value !== null && isMedalRankingType(value);
}

function parseMedalType(params: URLSearchParams): MedalType {
  const value = params.get("medal") ?? params.get("stat") ?? "overall";
  if (!isMedalType(value)) {
    throw new ApiInputError("medal must be overall, gold, silver, or bronze.");
  }
  return value;
}

function parseInput(params: URLSearchParams): MedalInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError("Choose a region before loading medal rankings.");
  }
  return {
    eventId: parseEvent(params, { required: false }),
    medalType: parseMedalType(params),
    scope,
    regionId,
    gender: parseGender(params),
    year: parseYear(params),
    start: parseStart(params),
    limit: parseLimit(params),
  };
}

function medalColumn(medalType: MedalType) {
  if (medalType === "gold") return "gold_count";
  if (medalType === "silver") return "silver_count";
  if (medalType === "bronze") return "bronze_count";
  return "gold_count + silver_count + bronze_count";
}

function scoreConditions(input: MedalInput) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.eventId !== null) {
    conditions.push("score.event_id = ?");
    values.push(input.eventId);
  }
  if (input.year !== null) {
    conditions.push("score.year = ?");
    values.push(input.year);
  }
  if (input.scope === "continent") {
    conditions.push("score.continent_id = ?");
    values.push(input.regionId);
  }
  if (input.scope === "country") {
    conditions.push("score.country_id = ?");
    values.push(input.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `score.person_gender IN (${input.gender.map(() => "?").join(", ")})`,
    );
    values.push(...input.gender);
  }
  return { conditions, values };
}

function eagerMedalRowsQuery() {
  return sqlFragment`WITH page AS (
      SELECT ranking.person_id, ranking.medal_count, ranking.rank, ranking.position
      FROM person_medal_rankings ranking
      WHERE ranking.event_id = ? AND ranking.medal_type = ?
        AND ranking.scope = ? AND ranking.region_id = ?
        AND ranking.position >= ? AND ranking.position < ?
      ORDER BY ranking.position, ranking.person_id
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY page.position, page.person_id`;
}

function eagerMedalCountQuery() {
  return sqlFragment`SELECT count FROM person_medal_ranking_counts
    WHERE event_id = ? AND medal_type = ? AND scope = ? AND region_id = ?`;
}

function lazyMedalRowsQuery(input: MedalInput) {
  const { conditions } = scoreConditions(input);
  const predicate = conditions.length ? conditions.join(" AND ") : "1 = 1";
  const countColumn = medalColumn(input.medalType);
  return sqlFragment`WITH totals AS (
      SELECT score.person_id, SUM(${countColumn}) AS medal_count
      FROM person_medal_scores score
      WHERE ${predicate}
      GROUP BY score.person_id
      HAVING SUM(${countColumn}) > 0
    ), ranked AS (
      SELECT totals.*,
        RANK() OVER (ORDER BY medal_count DESC) AS rank,
        ROW_NUMBER() OVER (ORDER BY medal_count DESC, person_id) AS position,
        COUNT(*) OVER () AS total_count
      FROM totals
    ), page AS (
      SELECT * FROM ranked
      WHERE position >= ? AND position < ?
      ORDER BY position
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY page.position, page.person_id`;
}

function lazyMedalCountQuery(input: MedalInput) {
  const { conditions } = scoreConditions(input);
  const predicate = conditions.length ? conditions.join(" AND ") : "1 = 1";
  const countColumn = medalColumn(input.medalType);
  return sqlFragment`SELECT COUNT(*) AS count
    FROM (
      SELECT score.person_id
      FROM person_medal_scores score
      WHERE ${predicate}
      GROUP BY score.person_id
      HAVING SUM(${countColumn}) > 0
    ) totals`;
}

function toEntry(row: MedalRow) {
  const medalCount = Number(row.medal_count);
  return {
    rank: Number(row.rank),
    subRank: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: medalCount,
    formattedValue: `${medalCountFormatter.format(medalCount)} medals`,
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

async function loadMedalWindow(input: MedalInput, windowStart: number) {
  const windowEnd = windowStart + RANKINGS_WINDOW_SIZE;
  if (input.year === null && input.gender.length === 0) {
    const eventId = input.eventId ?? "";
    const [rows, counts] = await Promise.all([
      query<MedalRow>(eagerMedalRowsQuery(), [
        eventId,
        input.medalType,
        input.scope,
        input.regionId,
        windowStart,
        windowEnd,
      ]),
      query<{ count: number }>(eagerMedalCountQuery(), [
        eventId,
        input.medalType,
        input.scope,
        input.regionId,
      ]),
    ]);
    return {
      data: {
        entries: rows.rows.map(toEntry),
        total: Number(counts.rows[0]?.count ?? 0),
      },
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    };
  }
  const { values } = scoreConditions(input);
  const [rows, counts] = await Promise.all([
    query<MedalRow>(lazyMedalRowsQuery(input), [
      ...values,
      windowStart,
      windowEnd,
    ]),
    query<{ count: number }>(lazyMedalCountQuery(input), values),
  ]);
  return {
    data: {
      entries: rows.rows.map(toEntry),
      total: Number(counts.rows[0]?.count ?? 0),
    },
    timings: addTimings(rows.timings, counts.timings),
    queryCount: 2,
    returnedRows: rows.rows.length + counts.rows.length,
  };
}

function windowKey(
  input: MedalInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    eventId: input.eventId,
    medalType: input.medalType,
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    year: input.year,
    windowStart,
  });
}

export async function loadPersonMedalRankings(params: URLSearchParams) {
  const input = parseInput(params);
  const metadata = await getCurrentRankingsMetadata();
  const windowStart =
    Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const cached = (await rankingsWindowCache.getWithStatus(
    windowKey(input, windowStart, metadata.fetchedAt),
    () => loadMedalWindow(input, windowStart),
  )) as {
    value: MedalWindow;
    outcome: "hit" | "miss" | "coalesced";
  };
  const offset = input.start - windowStart;
  const allEntries = cached.value.data.entries;
  const entries = allEntries.slice(offset, offset + input.limit);
  const total = cached.value.data.total;
  const startPosition = Math.min(Math.max(0, input.start - 1), total);
  const hasMore = startPosition + entries.length < total;
  return {
    data: {
      entries,
      hasMore,
      nextPageStart: hasMore ? input.start + input.limit : null,
      previousPageStart:
        input.start > 1 && total > 0
          ? Math.max(1, input.start - input.limit)
          : null,
      startPosition,
      lastRank: entries.at(-1)?.subRank ?? null,
      total,
    },
    diagnostics: {
      timings:
        cached.outcome === "hit"
          ? { queueMs: 0, statementMs: 0 }
          : cached.value.timings,
      queryCount: cached.value.queryCount,
      returnedRows: cached.value.returnedRows,
      cacheOutcome: cached.outcome,
      cacheLayer: "memory" as const,
    },
  };
}
