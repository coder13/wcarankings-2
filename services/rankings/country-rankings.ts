import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseGender,
  parseLimit,
  parseResultType,
  parseScope,
  parseYear,
} from "@/lib/api/projection";
import { formatWcaResult, type GenderFilter } from "@/lib/wca";

type CountryCountStat = "competitors" | "competitions" | "solves";

interface CountRow {
  count: number;
  [key: string]: unknown;
}

interface YearRow {
  stat_year: number;
  [key: string]: unknown;
}

interface CountryRankingRow {
  rank: number;
  position: number;
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

interface CountryResultRankingRow extends CountryRankingRow {
  person_name: string;
  competition_id: string;
  competition_name: string;
}

type CountryPageEntry = Pick<
  RankingEntry,
  | "personName"
  | "identitySubtitle"
  | "best"
  | "formattedValue"
  | "competitionId"
  | "competitionName"
>;

type CountryRows<Row extends CountryRankingRow> = Awaited<
  ReturnType<typeof query<Row>>
>;
type CountryCounts = Awaited<ReturnType<typeof query<CountRow>>>;
type CountryYears = Awaited<ReturnType<typeof query<YearRow>>>;

interface CountryFilters {
  sql: string;
  values: unknown[];
}

const GENDER_BITS: Record<GenderFilter, number> = { m: 1, f: 2, o: 4 };

export function countryGenderMask(genders: readonly GenderFilter[]) {
  if (genders.length === 0) return 7;
  return genders.reduce((mask, gender) => mask | GENDER_BITS[gender], 0);
}

export async function loadCountryRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const stat = params.get("stat");
  if (stat === "competitors" || stat === "competitions" || stat === "solves") {
    return loadCountryCountRankings(params, eventId, stat);
  }
  if (stat !== null) {
    throw new ApiInputError(
      "stat must be competitors, competitions, or solves.",
    );
  }
  const resultType = parseResultType(params, eventId);
  const limit = parseLimit(params);
  const start = countryStart(params);
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const filters = countryFilters(params, eventId);
  const countryRankingSql = `
    WITH ranked AS (
      SELECT stats.country_id, stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        RANK() OVER (ORDER BY stats.${valueColumn}) AS rank,
        ROW_NUMBER() OVER (ORDER BY stats.${valueColumn}, stats.country_id) AS position
      FROM country_event_stats stats
      WHERE stats.${valueColumn} IS NOT NULL${filters.sql}
    )`;
  const [rows, counts, years] = await Promise.all([
    query<CountryResultRankingRow>(
      `
    ${countryRankingSql}, page AS (
      SELECT * FROM ranked WHERE position > ? ORDER BY position LIMIT ?
    )
    SELECT page.*, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(person.name, facts.person_id) AS person_name,
      facts.competition_id,
      COALESCE(competition.name, facts.competition_id) AS competition_name
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    LEFT JOIN countries country ON country.id = page.country_id
    ORDER BY page.position
  `,
      [...filters.values, start, limit + 1],
    ),
    query<CountRow>(
      `${countryRankingSql} SELECT COUNT(*) AS count FROM ranked`,
      filters.values,
    ),
    loadAvailableCountryYears(eventId),
  ]);
  return countryPage(rows, counts, years, limit, start, (row) => ({
    personName: row.country_name,
    identitySubtitle: row.person_name,
    best: Number(row.result_value),
    formattedValue: formatWcaResult(
      eventId,
      Number(row.result_value),
      resultType,
    ),
    competitionId: row.competition_id,
    competitionName: `${row.competition_name} · ${row.person_name}`,
  }));
}

function countryStart(params: URLSearchParams) {
  const start = Number(params.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

function countryFilters(
  params: URLSearchParams,
  eventId: string,
): CountryFilters {
  const { scope, regionId } = parseScope(params);
  if (scope === "country") {
    throw new ApiInputError(
      "Country rankings can be filtered by continent, not by country.",
    );
  }
  const requestedYear = parseYear(params);
  const currentYear = new Date().getFullYear();
  if (
    requestedYear !== null &&
    (requestedYear < 1982 || requestedYear > currentYear)
  ) {
    throw new ApiInputError(`year must be between 1982 and ${currentYear}.`);
  }
  const values: unknown[] = [
    eventId,
    requestedYear ?? 0,
    countryGenderMask(parseGender(params)),
  ];
  let regionSql = "";
  if (scope === "continent") {
    regionSql = " AND stats.continent_id = ?";
    values.push(regionId);
  }
  return {
    sql: ` AND stats.event_id = ? AND stats.stat_year = ? AND stats.gender_mask = ?${regionSql}`,
    values,
  };
}

function loadAvailableCountryYears(eventId: string) {
  return query<YearRow>(
    `
      SELECT DISTINCT stat_year
      FROM country_event_stats
      WHERE event_id = ? AND stat_year > 0
      ORDER BY stat_year DESC
    `,
    [eventId],
  );
}

function countryPage<Row extends CountryRankingRow>(
  rows: CountryRows<Row>,
  counts: CountryCounts,
  years: CountryYears,
  limit: number,
  start: number,
  entry: (row: Row) => CountryPageEntry,
) {
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: `country:${row.country_id}`,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        recordBadges: [],
        ...entry(row),
      })),
      hasMore: rows.rows.length > limit,
      nextPageStart:
        rows.rows.length > limit && last ? Number(last.position) : null,
      previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(pageRows[0]?.position ?? start + 1) - 1,
      lastRank: pageRows.length ? Number(pageRows.at(-1)?.rank) : null,
      total: Number(counts.rows[0]?.count ?? 0),
      availableYears: years.rows.map(({ stat_year }) => Number(stat_year)),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings, years.timings),
      queryCount: 3,
      returnedRows: rows.rows.length + counts.rows.length + years.rows.length,
    },
  };
}

async function loadCountryCountRankings(
  params: URLSearchParams,
  eventId: string,
  stat: CountryCountStat,
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
  const filters = countryFilters(params, eventId);
  const limit = parseLimit(params);
  const start = countryStart(params);
  const countryRankingSql = `
    WITH ranked AS (
      SELECT stats.country_id, stats.${statColumn} AS stat_value,
        RANK() OVER (ORDER BY stats.${statColumn} DESC) AS rank,
        ROW_NUMBER() OVER (ORDER BY stats.${statColumn} DESC, stats.country_id) AS position
      FROM country_event_stats stats
      WHERE stats.${statColumn} > 0${filters.sql}
    )`;
  const [rows, counts, years] = await Promise.all([
    query<CountryRankingRow>(
      `
    ${countryRankingSql}
    SELECT ranked.*, COALESCE(country.name, ranked.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM ranked LEFT JOIN countries country ON country.id = ranked.country_id
    WHERE ranked.position > ? ORDER BY ranked.position LIMIT ?
  `,
      [...filters.values, start, limit + 1],
    ),
    query<CountRow>(
      `${countryRankingSql} SELECT COUNT(*) AS count FROM ranked`,
      filters.values,
    ),
    loadAvailableCountryYears(eventId),
  ]);
  return countryPage(rows, counts, years, limit, start, (row) => ({
    personName: row.country_name,
    identitySubtitle: statLabel,
    best: Number(row.stat_value),
    formattedValue: new Intl.NumberFormat("en-US").format(
      Number(row.stat_value),
    ),
    competitionId: "",
    competitionName: "",
  }));
}
