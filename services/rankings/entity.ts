import { query } from "@/db";
import { stripMarkdownLinks } from "@/lib/helpers/text/display-text";
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

import type {
  CompetitionRow,
  LatitudeRow,
  PodiumRow,
} from "@/services/rankings/types";
import {
  competitionEntityCountQuery,
  competitionEntityRowsQuery,
  competitorCountRowsQuery,
  competitorCountTotalQuery,
  latitudeCountQuery,
  latitudeRowsQuery,
  podiumEntityCountQuery,
  podiumEntityRowsQuery,
} from "@/services/rankings/queries";

export async function loadCompetitionRankings(params: URLSearchParams) {
  const ranking = params.get("ranking") ?? "fastest";
  const limit = parseLimit(params);
  if (ranking === "fastest") return loadFastestCompetitions(params, limit);
  if (ranking === "podium") return loadPodiumRankings(params, limit);
  if (ranking === "latitude") return loadLatitudeRankings(params, limit);
  if (ranking === "competitor-count")
    return loadCompetitorCountRankings(params, limit);
  throw new ApiInputError(
    "ranking must be fastest, podium, competitor-count, or latitude.",
  );
}

async function loadCompetitorCountRankings(
  params: URLSearchParams,
  limit: number,
) {
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const rows = await query<LatitudeRow & { competitor_count: number }>(
    competitorCountRowsQuery(),
    [start, limit + 1],
  );
  const counts = await query<{ count: number }>(competitorCountTotalQuery());
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: row.competition_id,
        personName: row.competition_name,
        identitySubtitle: stripMarkdownLinks(row.venue),
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        best: Number(row.competitor_count),
        formattedValue: new Intl.NumberFormat("en-US").format(
          Number(row.competitor_count),
        ),
        competitionId: row.competition_id,
        competitionName: row.city_name,
        recordBadges: [],
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

async function loadLatitudeRankings(params: URLSearchParams, limit: number) {
  const hemisphere = params.get("hemisphere") ?? "north";
  if (hemisphere !== "north" && hemisphere !== "south") {
    throw new ApiInputError("hemisphere must be north or south.");
  }
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const prefix = hemisphere === "north" ? "northernmost" : "southernmost";
  const direction = hemisphere === "north" ? "DESC" : "ASC";
  const { scope, regionId } = parseScope(params);
  const regionColumn =
    scope === "continent" ? "country.continent_id" : "competition.country_id";
  const rows =
    scope === "world"
      ? await query<LatitudeRow>(latitudeRowsQuery({ prefix, scoped: false }), [
          start,
          limit + 1,
        ])
      : await query<LatitudeRow>(
          latitudeRowsQuery({ prefix, direction, regionColumn, scoped: true }),
          [regionId, start, limit + 1],
        );
  const counts =
    scope === "world"
      ? await query<{ count: number }>(
          latitudeCountQuery({ prefix, scoped: false }),
        )
      : await query<{ count: number }>(
          latitudeCountQuery({ prefix, regionColumn, scoped: true }),
          [regionId],
        );
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: row.competition_id,
        personName: row.competition_name,
        identitySubtitle: stripMarkdownLinks(row.venue),
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        best: Number(row.latitude),
        formattedValue:
          Number(row.latitude) < 0
            ? `${Number(row.latitude) / 1_000_000}°`
            : `${Number(row.latitude) / 1_000_000}° N`,
        competitionId: row.competition_id,
        competitionName: row.city_name,
        recordBadges: [],
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

async function loadFastestCompetitions(params: URLSearchParams, limit: number) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const rankColumn = `${valueColumn}_rank`;
  const positionColumn = `${valueColumn}_position`;
  const rows = await query<CompetitionRow>(
    competitionEntityRowsQuery({
      valueColumn,
      resultIdColumn,
      rankColumn,
      positionColumn,
    }),
    [eventId, start, limit + 1],
  );
  const counts = await query<{ count: number }>(
    competitionEntityCountQuery({
      valueColumn,
      resultIdColumn,
      rankColumn,
      positionColumn,
    }),
    [eventId],
  );
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: row.competition_id,
        personName: row.competition_name,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        best: Number(row.result_value),
        competitionId: row.competition_id,
        competitionName: row.person_name ?? "",
        recordBadges: [],
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

async function loadPodiumRankings(
  params: URLSearchParams,
  limit = parseLimit(params),
) {
  const eventId = parseEvent(params)!;
  if (eventId === "333mbf")
    throw new ApiInputError("Multi-Blind podium rankings are not supported.");
  const resultType = ["333bf", "444bf", "555bf"].includes(eventId)
    ? "single"
    : "average";
  const positionColumn = "podium_position";
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const rows = await query<PodiumRow>(
    podiumEntityRowsQuery({ positionColumn }),
    [eventId, start, limit + 1, eventId, resultType],
  );
  const counts = await query<{ count: number }>(
    podiumEntityCountQuery({ positionColumn }),
    [eventId],
  );
  const byCompetition = new Map<
    string,
    {
      rank: number;
      position: number;
      score: number;
      competition: {
        id: string;
        name: string;
        startDate: string;
        country: { id: string; name: string; iso2: string };
      };
      members: Array<{
        position: number;
        person: { id: string; name: string };
        resultId: number;
        value: number;
      }>;
    }
  >();
  for (const row of rows.rows) {
    let entry = byCompetition.get(row.competition_id);
    if (!entry) {
      entry = {
        rank: Number(row.rank),
        position: Number(row.position),
        score: Number(row.score),
        competition: {
          id: row.competition_id,
          name: row.competition_name,
          startDate: row.start_date,
          country: {
            id: row.country_id,
            name: row.country_name,
            iso2: row.country_iso2,
          },
        },
        members: [],
      };
      byCompetition.set(row.competition_id, entry);
    }
    entry.members.push({
      position: Number(row.podium_position),
      person: { id: row.member_person_id, name: row.member_person_name },
      resultId: Number(row.member_result_id),
      value: Number(row.member_result_value),
    });
  }
  const entries = [...byCompetition.values()].slice(0, limit);
  const last = entries.at(-1);
  return {
    data: {
      entries: entries.map((entry) => ({
        rank: entry.rank,
        subRank: entry.position,
        personId: entry.competition.id,
        personName: entry.competition.name,
        countryName: entry.competition.country.name,
        countryIso2: entry.competition.country.iso2,
        best: entry.score,
        competitionId: entry.competition.id,
        competitionName: entry.members
          .map((member) => member.person.name)
          .join(" · "),
        recordBadges: [],
      })),
      hasMore: byCompetition.size > limit,
      nextPageStart:
        byCompetition.size > limit && last ? last.position + 1 : null,
      previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(rows.rows[0]?.position ?? start + 1) - 1,
      lastRank: entries.length ? (entries.at(-1)?.rank ?? null) : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
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
  const rows = await query<CityRankingRow>(
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
  const counts = await query<{ count: number }>(
    `
    ${cityRankingSql} SELECT COUNT(*) AS count FROM ranked
  `,
    filters.values,
  );
  return cityPage(rows, counts, limit, start, (row) => ({
    personName: row.city_name,
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

type CityCountStat = "competitors" | "competitions" | "solves";
type CityRankingRow = {
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
};

function cityStart(params: URLSearchParams) {
  const start = Number(params.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

function cityGender(params: URLSearchParams) {
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
) {
  const region =
    scope === "world"
      ? { sql: "", values: [] as unknown[] }
      : {
          sql: ` AND country.${scope === "continent" ? "continent_id" : "id"} = ?`,
          values: [regionId] as unknown[],
        };
  return {
    sql: ` AND stats.event_id = ? AND stats.gender = ?${region.sql}`,
    values: [eventId, gender, ...region.values],
  };
}

function cityPage(
  rows: Awaited<ReturnType<typeof query<CityRankingRow>>>,
  counts: Awaited<ReturnType<typeof query<{ count: number }>>>,
  limit: number,
  start: number,
  entry: (
    row: CityRankingRow,
  ) => Pick<
    import("@/components/RankingsExplorer/types").RankingEntry,
    | "personName"
    | "identitySubtitle"
    | "best"
    | "formattedValue"
    | "competitionId"
    | "competitionName"
  >,
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
  const counts = await query<{ count: number }>(
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
