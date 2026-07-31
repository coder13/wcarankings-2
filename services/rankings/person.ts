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

import type { PersonRankingRow } from "@/services/rankings/types";
import { personRankingCountsQuery, personRankingsQuery } from "@/services/rankings/queries";

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

  const rows = await query<PersonRankingRow>(
    personRankingsQuery({
      eventId,
      resultType,
      scope,
      regionId,
      rankColumn,
      positionColumn,
      conditions,
    }),
    [...values, limit + 1],
  );

  const counts = await query<{ count: number }>(personRankingCountsQuery(), [
    eventId,
    resultType,
    scope,
    regionId,
  ]);
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
      context: {
        resource: "people",
        eventId,
        result: resultType,
        scope,
        regionId,
        personId: personId || null,
      },
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
