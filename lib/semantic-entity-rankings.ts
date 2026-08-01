import { query } from "@/db";
import { stripMarkdownLinks } from "@/lib/display-text";
import { formatWcaResult } from "@/lib/wca";
import {
  addTimings,
  ApiInputError,
  optionalInteger,
  optionalText,
  parseEvent,
  parseLimit,
  parseResultType,
  parseScope,
} from "@/lib/projection-api";

type CompetitionRow = {
  rank: number;
  competition_id: string;
  competition_name: string;
  start_date: string;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  latitude: number | null;
  longitude: number | null;
  competitor_count: number;
  result_id: number | null;
  result_value: number | null;
  person_id: string | null;
  person_name: string | null;
  round_type_id: string | null;
  position: number;
};

async function entityCount(kind: string, eventId = "", resultType = "") {
  return query<{ count: number }>(
    `SELECT count FROM entity_ranking_counts
     WHERE ranking_kind = ? AND event_id = ? AND result_type = ?`,
    [kind, eventId, resultType],
  );
}

export async function loadCompetitionRankings(params: URLSearchParams) {
  const ranking = params.get("ranking") ?? "fastest";
  const limit = parseLimit(params);
  if (ranking === "fastest") return loadFastestCompetitions(params, limit);
  if (ranking === "podium") return loadPodiumRankings(params, limit);
  if (ranking === "latitude") return loadLatitudeRankings(params, limit);
  if (ranking === "competitor-count") return loadCompetitorCountRankings(params, limit);
  throw new ApiInputError("ranking must be fastest, podium, competitor-count, or latitude.");
}

async function loadCompetitorCountRankings(params: URLSearchParams, limit: number) {
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const rows = await query<LatitudeRow & { competitor_count: number }>(`
    WITH page AS (
      SELECT stats.competition_id, stats.competitor_count,
        stats.competitor_count_rank AS rank,
        stats.competitor_count_position AS position
      FROM competition_stats stats
      WHERE stats.competitor_count_position > ?
      ORDER BY stats.competitor_count_position
      LIMIT ?
    )
    SELECT page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.venue, '') AS venue,
      COALESCE(competition.city_name, '') AS city_name,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.position
  `, [start, limit + 1]);
  const counts = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM competition_stats
     WHERE competitor_count_position IS NOT NULL`,
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
        best: Number(row.competitor_count),
        formattedValue: new Intl.NumberFormat("en-US").format(Number(row.competitor_count)),
        competitionId: row.competition_id,
        competitionName: row.city_name,
        recordBadges: [],
      })),
      hasMore: rows.rows.length > limit,
      nextPageStart: rows.rows.length > limit && last
        ? Number(last.position) + 1
        : null,
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

type LatitudeRow = {
  rank: number;
  position: number;
  competition_id: string;
  competition_name: string;
  venue: string;
  city_name: string;
  country_name: string;
  country_iso2: string;
  latitude: number;
};

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
  const regionColumn = scope === "continent"
    ? "country.continent_id"
    : "competition.country_id";
  const rows = scope === "world"
    ? await query<LatitudeRow>(`
    WITH page AS (
      SELECT stats.competition_id, stats.latitude,
        stats.${prefix}_rank AS rank,
        stats.${prefix}_position AS position
      FROM competition_stats stats
      WHERE stats.${prefix}_position > ?
      ORDER BY stats.${prefix}_position
      LIMIT ?
    )
    SELECT page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.venue, '') AS venue,
      COALESCE(competition.city_name, '') AS city_name,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.position
  `, [start, limit + 1])
    : await query<LatitudeRow>(`
    WITH scoped AS (
      SELECT stats.competition_id, stats.start_date, stats.latitude,
        COALESCE(competition.name, stats.competition_id) AS competition_name,
        COALESCE(competition.venue, '') AS venue,
        COALESCE(competition.city_name, '') AS city_name,
        COALESCE(country.name, competition.country_id, '') AS country_name,
        COALESCE(country.iso2, '') AS country_iso2
      FROM competition_stats stats
      JOIN competitions competition ON competition.id = stats.competition_id
      JOIN countries country ON country.id = competition.country_id
      WHERE stats.${prefix}_position IS NOT NULL
        AND ${regionColumn} = ?
    ), ranked AS (
      SELECT scoped.*,
        DENSE_RANK() OVER (ORDER BY latitude ${direction}) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY latitude ${direction}, start_date, competition_id
        ) AS position
      FROM scoped
    )
    SELECT *
    FROM ranked
    WHERE position > ?
    ORDER BY position
    LIMIT ?
  `, [regionId, start, limit + 1]);
  const counts = scope === "world"
    ? await query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM competition_stats
       WHERE ${prefix}_position IS NOT NULL`,
    )
    : await query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM competition_stats stats
       JOIN competitions competition ON competition.id = stats.competition_id
       JOIN countries country ON country.id = competition.country_id
       WHERE stats.${prefix}_position IS NOT NULL
         AND ${regionColumn} = ?`,
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
        formattedValue: Number(row.latitude) < 0
          ? `${Number(row.latitude) / 1_000_000}°`
          : `${Number(row.latitude) / 1_000_000}° N`,
        competitionId: row.competition_id,
        competitionName: row.city_name,
        recordBadges: [],
      })),
      hasMore: rows.rows.length > limit,
      nextPageStart: rows.rows.length > limit && last
        ? Number(last.position) + 1
        : null,
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
  const rows = await query<CompetitionRow>(`
    WITH page AS (
      SELECT stats.competition_id, stats.start_date,
        stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        stats.${rankColumn} AS rank,
        stats.${positionColumn} AS position
      FROM competition_event_stats stats
      WHERE stats.event_id = ? AND stats.${positionColumn} > ?
      ORDER BY stats.${positionColumn}
      LIMIT ?
    )
    SELECT page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      result.person_id, COALESCE(person.name, result.person_id) AS person_name
    FROM page
    INNER JOIN results result ON result.id = page.result_id
    LEFT JOIN persons person ON person.wca_id = result.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.position
  `, [eventId, start, limit + 1]);
  const counts = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM competition_event_stats
     WHERE event_id = ? AND ${positionColumn} IS NOT NULL`,
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
      nextPageStart: rows.rows.length > limit && last
        ? Number(last.position) + 1
        : null,
      previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(pageRows[0]?.position ?? start + 1) - 1,
      lastRank: pageRows.length
        ? Number(pageRows.at(-1)?.rank)
        : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

type PodiumRow = CompetitionRow & {
  score: number;
  podium_position: number;
  member_person_id: string;
  member_person_name: string;
  member_result_id: number;
  member_result_value: number;
};

export async function loadPodiumRankings(params: URLSearchParams, limit = parseLimit(params)) {
  const eventId = parseEvent(params)!;
  if (eventId === "333mbf") throw new ApiInputError("Multi-Blind podium rankings are not supported.");
  const resultType = ["333bf", "444bf", "555bf"].includes(eventId)
    ? "single"
    : "average";
  const scoreColumn = "podium_score";
  const rankColumn = "podium_rank";
  const positionColumn = "podium_position";
  const rawStart = params.get("start") ?? "0";
  const start = Number(rawStart);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const rows = await query<PodiumRow>(`
    WITH page AS (
      SELECT stats.competition_id, stats.start_date,
        stats.${scoreColumn} AS score, stats.${rankColumn} AS rank,
        stats.${positionColumn} AS position
      FROM competition_event_stats stats
      WHERE stats.event_id = ? AND stats.${positionColumn} > ?
      ORDER BY stats.${positionColumn}
      LIMIT ?
    )
    SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.country_id, '') AS country_id,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      member.podium_position, member.person_id AS member_person_id,
      COALESCE(person.name, member.person_id) AS member_person_name,
      member.result_id AS member_result_id, member.result_value AS member_result_value
    FROM page
    INNER JOIN competition_podium_members member
      ON member.competition_id = page.competition_id
      AND member.event_id = ?
      AND member.result_type = ?
    LEFT JOIN persons person ON person.wca_id = member.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY page.position, member.podium_position, member.result_id
  `, [eventId, start, limit + 1, eventId, resultType]);
  const counts = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM competition_event_stats
     WHERE event_id = ? AND ${positionColumn} IS NOT NULL`,
    [eventId],
  );
  const byCompetition = new Map<string, {
    rank: number;
    position: number;
    score: number;
    competition: {
      id: string;
      name: string;
      startDate: string;
      country: { id: string; name: string; iso2: string };
    };
    members: Array<{ position: number; person: { id: string; name: string }; resultId: number; value: number }>;
  }>();
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
        identitySubtitle: entry.members.map((member) => member.person.name).join(" · "),
        countryName: entry.competition.country.name,
        countryIso2: entry.competition.country.iso2,
        best: entry.score,
        competitionId: entry.competition.id,
        competitionName: "",
        resultSubtitle: entry.members
          .map((member) => formatWcaResult(eventId, member.value, resultType))
          .join(", "),
        recordBadges: [],
      })),
      hasMore: byCompetition.size > limit,
      nextPageStart: byCompetition.size > limit && last
        ? last.position + 1
        : null,
      previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(rows.rows[0]?.position ?? start + 1) - 1,
      lastRank: entries.length ? entries.at(-1)?.rank ?? null : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}

type CityRow = {
  rank: number;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  result_id: number;
  result_value: number;
  person_id: string;
  person_name: string;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export async function loadCityRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  const limit = parseLimit(params);
  const valueColumn = `fastest_${resultType}`;
  const resultIdColumn = `${valueColumn}_result_id`;
  const rankColumn = `${valueColumn}_rank`;
  const afterValue = optionalInteger(params, "afterValue");
  const afterCountryId = optionalText(params, "afterCountryId");
  const afterCity = optionalText(params, "afterCity");
  const supplied = [afterValue, afterCountryId, afterCity].filter((value) => value !== null).length;
  if (supplied !== 0 && supplied !== 3) throw new ApiInputError("All city cursor fields must be supplied together.");
  const values: unknown[] = [eventId];
  let cursor = "";
  if (supplied === 3) {
    cursor = ` AND (
      stats.${valueColumn} > ?
      OR (stats.${valueColumn} = ? AND stats.country_id > ?)
      OR (stats.${valueColumn} = ? AND stats.country_id = ? AND stats.city_name > ?)
    )`;
    values.push(afterValue, afterValue, afterCountryId, afterValue, afterCountryId, afterCity);
  }
  const rows = await query<CityRow>(`
    WITH page AS (
      SELECT stats.city_name, stats.country_id,
        stats.${valueColumn} AS result_value,
        stats.${resultIdColumn} AS result_id,
        stats.${rankColumn} AS rank
      FROM city_event_stats stats
      WHERE stats.event_id = ? AND stats.${valueColumn} IS NOT NULL${cursor}
      ORDER BY stats.${valueColumn}, stats.country_id, stats.city_name
      LIMIT ?
    )
    SELECT page.*, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      facts.person_id, COALESCE(person.name, facts.person_id) AS person_name,
      facts.competition_id, COALESCE(competition.name, facts.competition_id) AS competition_name,
      facts.competition_start_date, facts.round_type_id
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    LEFT JOIN countries country ON country.id = page.country_id
    ORDER BY page.result_value, page.country_id, page.city_name
  `, [...values, limit + 1]);
  const counts = await entityCount("city", eventId, resultType);
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        city: {
          name: row.city_name,
          country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
        },
        result: {
          id: Number(row.result_id),
          value: Number(row.result_value),
          person: { id: row.person_id, name: row.person_name },
          competition: {
            id: row.competition_id,
            name: row.competition_name,
            startDate: row.competition_start_date,
          },
          roundTypeId: row.round_type_id,
        },
      })),
      context: { resource: "cities", eventId, result: resultType },
      page: {
        limit,
        hasMore: rows.rows.length > limit,
        next: rows.rows.length > limit && last
          ? {
              afterValue: Number(last.result_value),
              afterCountryId: last.country_id,
              afterCity: last.city_name,
            }
          : null,
      },
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
