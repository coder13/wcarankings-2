import { sqlFragment } from "@/lib/helpers/database/sql";
import type { GenderRankingQueryInput } from "@/services/rankings/types";

interface GenderPersonRankingRowsQueryInput {
  genderCount: number;
  recordColumn: string;
  positionColumn: string;
  regionColumn: string | null;
}

export function genderRankingPageQuery(input: GenderRankingQueryInput) {
  return sqlFragment`
    WITH
      filtered AS (
        SELECT
          ranking.*,
          RANK() OVER (
            ORDER BY
              ranking.best
          ) AS filtered_rank,
          ROW_NUMBER() OVER (
            ORDER BY
              ranking.best,
              ranking.person_name,
              ranking.person_id
          ) AS filtered_position,
          COUNT(*) OVER () AS total_count
        FROM
          ${input.source} ranking
        WHERE
          ${input.baseConditions.join(" AND ")}
      )
    SELECT
      ${input.selectColumns},
      total_count
    FROM
      filtered ${
        input.conditions.length ? `WHERE ${input.conditions.join(" AND ")}` : ""
      }
    ORDER BY
      filtered_position
    LIMIT
      ?
  `;
}

export function genderPersonRankingRowsQuery({
  genderCount,
  recordColumn,
  positionColumn,
  regionColumn,
}: GenderPersonRankingRowsQueryInput) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  const regionCondition = regionColumn
    ? ` AND ranking.${regionColumn} = ?`
    : "";
  return sqlFragment`
    WITH
      page AS (
        SELECT
          ranking.person_id,
          ranking.result_id,
          ranking.result_value,
          ranking.country_id,
          ranking.continent_id,
          ranking.world_rank,
          ranking.${positionColumn} AS page_position
        FROM
          person_event_rankings ranking
        WHERE
          ranking.event_id = ?
          AND ranking.result_type = ?
          AND ranking.gender IN (${genderPlaceholders}) ${regionCondition}
        ORDER BY
          ranking.${positionColumn},
          ranking.person_id
        LIMIT
          ?
        OFFSET
          ?
      )
    SELECT
      page.person_id,
      page.result_id,
      page.result_value,
      page.country_id,
      page.continent_id,
      page.world_rank,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(facts.competition_id, '') AS competition_id,
      COALESCE(competition.name, '') AS competition_name,
      ${recordColumn} = 'WR' AS is_world_record,
      ${recordColumn} IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      ${recordColumn} = 'NR' AS is_country_record
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = page.result_id
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
    ORDER BY
      page.page_position,
      page.person_id
  `;
}

export function genderPersonRankingCountQuery(
  genderCount: number,
  regionColumn: string | null,
) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      person_event_rankings ranking
    WHERE
      ranking.event_id = ?
      AND ranking.result_type = ?
      AND ranking.gender IN (${genderPlaceholders}) ${
        regionColumn ? ` AND ranking.${regionColumn} = ?` : ""
      }
  `;
}

export function genderPersonRankingPrefixCountQuery(
  genderCount: number,
  regionColumn: string | null,
) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      person_event_rankings ranking
    WHERE
      ranking.event_id = ?
      AND ranking.result_type = ?
      AND ranking.gender IN (${genderPlaceholders})
      AND ranking.result_value < ? ${
        regionColumn ? ` AND ranking.${regionColumn} = ?` : ""
      }
  `;
}
