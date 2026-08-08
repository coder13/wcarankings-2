import { query } from "@/db";
import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { formatWcaResult } from "@/lib/wca";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseGender,
  parseLimit,
  parseResultType,
  parseScope,
} from "@/lib/api/projection";

type CityCountStat = "competitors" | "competitions" | "solves";

interface CountRow {
  count: number;
  [key: string]: unknown;
}

interface CityRankingRow {
  rank: number;
  position: number;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  result_value?: number;
  person_name?: string;
  competition_id?: string;
  competition_name?: string;
  stat_value?: number;
  [key: string]: unknown;
}

interface CityResultRankingRow extends CityRankingRow {
  person_name: string;
  competition_id: string;
  competition_name: string;
}

type CityPageEntry = Pick<
  RankingEntry,
  | "personName"
  | "identitySubtitle"
  | "resultSubtitle"
  | "best"
  | "formattedValue"
  | "competitionId"
  | "competitionName"
>;

type CityRows<Row extends CityRankingRow> = Awaited<
  ReturnType<typeof query<Row>>
>;

type CityCounts = Awaited<ReturnType<typeof query<CountRow>>>;

interface CityFilters {
  sql: string;
  values: unknown[];
}

export async function loadCityRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const stat = params.get("stat");
  if (stat === "competitors" || stat === "competitions" || stat === "solves") {
    return loadCityCountRankings(params, eventId, stat);
  }
  const resultType = parseResultType(params, eventId);
  const gender = cityGender(params);
  const { scope, regionId } = parseScope(params);
  const limit = parseLimit(params);
  const start = cityStart(params);
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const filters = cityFilters(eventId, gender, scope, regionId);
  const cityRankingSql = `
    WITH ranked AS (
      SELECT stats.city_name, stats.country_id,
        stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        DENSE_RANK() OVER (ORDER BY stats.${valueColumn}) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY stats.${valueColumn}, stats.country_id, stats.city_name
        ) AS position
      FROM city_event_stats stats
      LEFT JOIN countries country ON country.id = stats.country_id
      WHERE stats.${valueColumn} IS NOT NULL${filters.sql}
    )`;
  const rows = await query<CityResultRankingRow>(
    `
    ${cityRankingSql}, page AS (
      SELECT * FROM ranked WHERE position > ? ORDER BY position LIMIT ?
    )
    SELECT page.*, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      facts.person_id, COALESCE(person.name, facts.person_id) AS person_name,
      facts.competition_id, COALESCE(competition.name, facts.competition_id) AS competition_name
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    LEFT JOIN countries country ON country.id = page.country_id
    ORDER BY page.position
  `,
    [...filters.values, start, limit + 1],
  );
  const counts = await query<CountRow>(
    `
    ${cityRankingSql} SELECT COUNT(*) AS count FROM ranked
  `,
    filters.values,
  );
  return cityPage(rows, counts, limit, start, (row) => ({
    personName: row.city_name,
    identitySubtitle: row.competition_name,
    best: Number(row.result_value),
    formattedValue: formatWcaResult(
      eventId,
      Number(row.result_value),
      resultType,
    ),
    competitionId: row.competition_id,
    competitionName: "",
    resultSubtitle: row.person_name,
  }));
}

function cityStart(params: URLSearchParams): number {
  const start = Number(params.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

function cityGender(params: URLSearchParams): string {
  const requested = parseGender(params);
  if (requested.length > 1) {
    throw new ApiInputError("City rankings support one gender at a time.");
  }
  return requested[0] ?? "all";
}

function cityFilters(
  eventId: string,
  gender: string,
  scope: "world" | "continent" | "country",
  regionId: string,
): CityFilters {
  let regionSql = "";
  const regionValues: unknown[] = [];
  if (scope !== "world") {
    const regionColumn = scope === "continent" ? "continent_id" : "id";
    regionSql = ` AND country.${regionColumn} = ?`;
    regionValues.push(regionId);
  }
  return {
    sql: ` AND stats.event_id = ? AND stats.gender = ?${regionSql}`,
    values: [eventId, gender, ...regionValues],
  };
}

function cityPage<Row extends CityRankingRow>(
  rows: CityRows<Row>,
  counts: CityCounts,
  limit: number,
  start: number,
  entry: (row: Row) => CityPageEntry,
) {
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: `city:${row.country_id}:${row.city_name}`,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        recordBadges: [],
        ...entry(row),
      })),
      hasMore: rows.rows.length > limit,
      nextPageStart:
        rows.rows.length > limit && last ? Number(last.position) + 1 : null,
      previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(pageRows[0]?.position ?? start + 1) - 1,
      lastRank: pageRows.length ? Number(pageRows.at(-1)?.rank) : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

async function loadCityCountRankings(
  params: URLSearchParams,
  eventId: string,
  stat: CityCountStat,
) {
  const statColumn = {
    competitors: "competitor_count",
    competitions: "competition_count",
    solves: "official_solve_count",
  }[stat];
  const statLabel = {
    competitors: "competitors",
    competitions: "competitions",
    solves: "official solves",
  }[stat];
  const { scope, regionId } = parseScope(params);
  const filters = cityFilters(eventId, cityGender(params), scope, regionId);
  const limit = parseLimit(params);
  const start = cityStart(params);
  const cityRankingSql = `
    WITH ranked AS (
      SELECT stats.city_name, stats.country_id, stats.${statColumn} AS stat_value,
        DENSE_RANK() OVER (ORDER BY stats.${statColumn} DESC) AS rank,
        ROW_NUMBER() OVER (ORDER BY stats.${statColumn} DESC, stats.country_id, stats.city_name) AS position
      FROM city_event_stats stats
      LEFT JOIN countries country ON country.id = stats.country_id
      WHERE stats.${statColumn} > 0${filters.sql}
    )`;
  const rows = await query<CityRankingRow>(
    `
    ${cityRankingSql}
    SELECT ranked.*, COALESCE(country.name, ranked.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM ranked LEFT JOIN countries country ON country.id = ranked.country_id
    WHERE ranked.position > ? ORDER BY ranked.position LIMIT ?
  `,
    [...filters.values, start, limit + 1],
  );
  const counts = await query<CountRow>(
    `
    ${cityRankingSql} SELECT COUNT(*) AS count FROM ranked
  `,
    filters.values,
  );
  return cityPage(rows, counts, limit, start, (row) => ({
    personName: row.city_name,
    identitySubtitle: statLabel,
    best: Number(row.stat_value),
    formattedValue: new Intl.NumberFormat("en-US").format(
      Number(row.stat_value),
    ),
    competitionId: "",
    competitionName: "",
  }));
}
