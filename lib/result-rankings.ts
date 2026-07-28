import { query } from "@/db";
import { getRecordBadges, type RankingType, type RegionScope } from "@/lib/wca";

export type ResultEntry = {
  resultId: string;
  rank: number;
  personId: string;
  personName: string;
  countryName: string;
  countryIso2: string;
  value: number;
  competitionId: string;
  competitionName: string;
  competitionDate: string | null;
  roundTypeId: string;
  recordBadges: ReturnType<typeof getRecordBadges>;
};

const PAGE_SIZE = 50;

export function roundName(roundTypeId: string) {
  return ({
    "0": "Qualification",
    "1": "First round",
    "2": "Second round",
    "3": "Semi final",
    b: "B final",
    c: "Combined final",
    d: "Final",
    f: "Final",
    g: "Group final",
  } as Record<string, string>)[roundTypeId] ?? roundTypeId;
}

export async function loadResultLeaderboard({
  eventId,
  type,
  scope,
  regionId,
  page,
}: {
  eventId: string;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  page: number;
}) {
  if (scope !== "world" && !regionId) throw new Error("Choose a region before loading results.");

  const valueColumn = type === "average" ? "average" : "best";
  const ranksTable = type === "average" ? "ranks_average" : "ranks_single";
  const regionColumn = scope === "continent" ? "c.continent_id" : scope === "country" ? "p.country_id" : null;
  const where = ["r.event_id = ?", `r.${valueColumn} > 0`];
  const values: unknown[] = [eventId];
  if (regionColumn) {
    where.push(`${regionColumn} = ?`);
    values.push(regionId);
  }

  const offset = Math.max(0, page) * PAGE_SIZE;
  const [entries, total] = await Promise.all([
    query<{
      result_id: string; rank: number; person_id: string; person_name: string; country_name: string;
      country_iso2: string; value: number; competition_id: string; competition_name: string;
      competition_date: string | null; round_type_id: string; is_world_record: number;
      is_continent_record: number; is_country_record: number; continent_id: string;
    }>(
      `WITH scoped_results AS (
        SELECT r.id AS result_id, r.person_id, COALESCE(p.name, r.person_id) AS person_name,
          COALESCE(c.name, p.country_id, '') AS country_name, COALESCE(c.iso2, '') AS country_iso2,
          c.continent_id, r.${valueColumn} AS value, r.competition_id,
          COALESCE(comp.name, r.competition_id) AS competition_name, comp.start_date AS competition_date,
          r.round_type_id,
          CASE WHEN current_rank.world_rank = 1 AND current_rank.best = r.${valueColumn} THEN 1 ELSE 0 END AS is_world_record,
          CASE WHEN current_rank.continent_rank = 1 AND current_rank.best = r.${valueColumn} THEN 1 ELSE 0 END AS is_continent_record,
          CASE WHEN current_rank.country_rank = 1 AND current_rank.best = r.${valueColumn} THEN 1 ELSE 0 END AS is_country_record
        FROM results r
        LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
        LEFT JOIN countries c ON c.id = p.country_id
        LEFT JOIN competitions comp ON comp.id = r.competition_id
        LEFT JOIN ${ranksTable} current_rank ON current_rank.person_id = r.person_id AND current_rank.event_id = r.event_id
        WHERE ${where.join(" AND ")}
      )
      SELECT *, DENSE_RANK() OVER (ORDER BY value) AS rank
      FROM scoped_results
      ORDER BY value, competition_id, round_type_id, person_id, result_id
      LIMIT ? OFFSET ?`,
      [...values, PAGE_SIZE, offset],
    ),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM results r
       LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
       LEFT JOIN countries c ON c.id = p.country_id
       WHERE ${where.join(" AND ")}`,
      values,
    ),
  ]);

  return {
    entries: entries.rows.map((row) => ({
      resultId: String(row.result_id),
      rank: Number(row.rank),
      personId: row.person_id,
      personName: row.person_name,
      countryName: row.country_name,
      countryIso2: row.country_iso2,
      value: Number(row.value),
      competitionId: row.competition_id,
      competitionName: row.competition_name,
      competitionDate: row.competition_date,
      roundTypeId: row.round_type_id,
      recordBadges: getRecordBadges({
        isWorldRecord: row.is_world_record === 1,
        isContinentRecord: row.is_continent_record === 1,
        isCountryRecord: row.is_country_record === 1,
        continentId: row.continent_id,
      }),
    })),
    page,
    total: Number(total.rows[0]?.total ?? 0),
    pageSize: PAGE_SIZE,
  };
}
