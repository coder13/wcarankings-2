import { query } from "@/db";
import {
  addTimings,
  parseEvent,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseScope,
  parseStart,
} from "@/lib/api/projection";

type PersonRankingRow = {
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  rank: number;
  result_id: number;
  result_value: number;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export async function loadPersonRankings(params: URLSearchParams) {
  const eventId = parseEvent(params)!;
  const resultType = parseResultType(params, eventId);
  const { scope, regionId } = parseScope(params);
  const personId = parsePersonId(params);
  const start = parseStart(params);
  const limit = parseLimit(params);
  const rankColumn = `${scope}_rank`;
  const positionColumn = `${scope}_position`;
  const conditions = ["ranking.event_id = ?", "ranking.result_type = ?"];
  const values: unknown[] = [eventId, resultType];
  if (scope !== "world") {
    conditions.push(`ranking.${scope}_id = ?`);
    values.push(regionId);
  }
  if (personId) {
    conditions.push("ranking.person_id = ?");
    values.push(personId);
  } else {
    conditions.push(`ranking.${positionColumn} >= ?`);
    values.push(start);
  }

  const rows = await query<PersonRankingRow>(`
    WITH page AS (
      SELECT ranking.person_id, ranking.result_id, ranking.result_value,
        ranking.country_id, ranking.continent_id,
        ranking.${rankColumn} AS rank, ranking.${positionColumn} AS page_position
      FROM person_event_rankings ranking
      WHERE ${conditions.join(" AND ")}
      ORDER BY ranking.${positionColumn}, ranking.person_id
      LIMIT ?
    )
    SELECT page.person_id, COALESCE(person.name, page.person_id) AS person_name,
      page.country_id, COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2, page.continent_id,
      page.rank, page.result_id, page.result_value,
      facts.competition_id, COALESCE(competition.name, facts.competition_id) AS competition_name,
      facts.competition_start_date, facts.round_type_id
    FROM page
    INNER JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    ORDER BY page.page_position, page.person_id
  `, [...values, limit + 1]);

  const counts = await query<{ count: number }>(
    `SELECT count FROM person_ranking_counts
     WHERE event_id = ? AND result_type = ? AND scope = ? AND region_id = ?`,
    [eventId, resultType, scope, regionId],
  );
  const pageRows = rows.rows.slice(0, limit);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        personId: row.person_id,
        personName: row.person_name,
        country: {
          id: row.country_id,
          name: row.country_name,
          iso2: row.country_iso2,
        },
        continentId: row.continent_id,
        result: {
          id: Number(row.result_id),
          value: Number(row.result_value),
          competitionId: row.competition_id,
          competitionName: row.competition_name,
          competitionStartDate: row.competition_start_date,
          roundTypeId: row.round_type_id,
        },
      })),
      context: { resource: "people", eventId, result: resultType, scope, regionId, personId: personId || null },
      page: {
        limit,
        hasMore: rows.rows.length > limit,
        next: rows.rows.length > limit && !personId ? { start: start + limit } : null,
      },
      total: personId ? pageRows.length : Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
