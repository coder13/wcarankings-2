import { query } from "@/db";
import { stripMarkdownLinks } from "@/lib/helpers/text/display-text";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseLimit,
  parseResultType,
  parseScope,
} from "@/lib/api/projection";
import {
  competitionEntityCountQuery,
  competitionEntityRowsQuery,
  competitorCountRowsQuery,
  competitorCountTotalQuery,
  latitudeCountQuery,
  latitudeRowsQuery,
  podiumEntityCountQuery,
  podiumEntityRowsQuery,
} from "@/services/rankings/queries/competitions";
import type {
  CompetitionRow,
  LatitudeRow,
  PodiumRow,
} from "@/services/rankings/types";

interface CountRow {
  count: number;
  [key: string]: unknown;
}

interface CompetitorCountRow extends LatitudeRow {
  competitor_count: number;
  [key: string]: unknown;
}

interface PodiumCountry {
  id: string;
  name: string;
  iso2: string;
}

interface PodiumCompetition {
  id: string;
  name: string;
  startDate: string;
  country: PodiumCountry;
}

interface PodiumPerson {
  id: string;
  name: string;
}

interface PodiumMember {
  position: number;
  person: PodiumPerson;
  resultId: number;
  value: number;
}

interface PodiumRanking {
  rank: number;
  position: number;
  score: number;
  competition: PodiumCompetition;
  members: PodiumMember[];
}

function pageStart(params: URLSearchParams): number {
  const start = Number(params.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

export async function loadCompetitionRankings(params: URLSearchParams) {
  const ranking = params.get("ranking") ?? "fastest";
  const limit = parseLimit(params);
  if (ranking === "fastest") return loadFastestCompetitions(params, limit);
  if (ranking === "podium") return loadPodiumRankings(params, limit);
  if (ranking === "latitude") return loadLatitudeRankings(params, limit);
  if (ranking === "competitor-count") {
    return loadCompetitorCountRankings(params, limit);
  }
  throw new ApiInputError(
    "ranking must be fastest, podium, competitor-count, or latitude.",
  );
}

async function loadCompetitorCountRankings(
  params: URLSearchParams,
  limit: number,
) {
  const start = pageStart(params);
  const rows = await query<CompetitorCountRow>(competitorCountRowsQuery(), [
    start,
    limit + 1,
  ]);
  const counts = await query<CountRow>(competitorCountTotalQuery());
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
  const start = pageStart(params);
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
      ? await query<CountRow>(latitudeCountQuery({ prefix, scoped: false }))
      : await query<CountRow>(
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
  const start = pageStart(params);
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
  const counts = await query<CountRow>(
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

async function loadPodiumRankings(params: URLSearchParams, limit: number) {
  const eventId = parseEvent(params)!;
  if (eventId === "333mbf") {
    throw new ApiInputError("Multi-Blind podium rankings are not supported.");
  }
  const resultType = ["333bf", "444bf", "555bf"].includes(eventId)
    ? "single"
    : "average";
  const positionColumn = "podium_position";
  const start = pageStart(params);
  const rows = await query<PodiumRow>(
    podiumEntityRowsQuery({ positionColumn }),
    [eventId, start, limit + 1, eventId, resultType],
  );
  const counts = await query<CountRow>(
    podiumEntityCountQuery({ positionColumn }),
    [eventId],
  );
  const byCompetition = new Map<string, PodiumRanking>();
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
