import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseLimit,
  parseScope,
} from "@/lib/api/projection";
import {
  personCompetitionRankingCountQuery,
  personCompetitionRankingRowsQuery,
} from "@/services/rankings/queries";
import type { PersonCompetitionRankingRow } from "@/services/rankings/types";

const countFormatter = new Intl.NumberFormat("en-US");

export async function loadPersonCompetitionRankings(params: URLSearchParams) {
  const { scope, regionId } = parseScope(params);
  const genders = parseGender(params);
  if (genders.length > 1) {
    throw new ApiInputError("Competition rankings support one gender filter at a time.");
  }
  const gender = genders[0] ?? "all";
  const start = Number(params.get("start") ?? "0");
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  const limit = parseLimit(params);
  const [rows, counts] = await Promise.all([
    query<PersonCompetitionRankingRow>(personCompetitionRankingRowsQuery(), [
      scope,
      regionId,
      gender,
      start,
      limit + 1,
    ]),
    query<{ count: number }>(personCompetitionRankingCountQuery(), [scope, regionId, gender]),
  ]);
  const pageRows = rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        rank: Number(row.rank),
        position: Number(row.position),
        personId: row.person_id,
        personName: row.person_name,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        best: Number(row.competition_count),
        formattedValue: `${countFormatter.format(Number(row.competition_count))} competitions`,
        competitionId: "",
        competitionName: "",
        recordBadges: [],
      })),
      hasMore: rows.rows.length > limit,
      nextPageStart: rows.rows.length > limit && last ? Number(last.position) + 1 : null,
      previousPageStart: start > 1 ? Math.max(1, start - limit) : null,
      startPosition: Number(pageRows[0]?.position ?? start) - 1,
      lastRank: last ? Number(last.rank) : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
