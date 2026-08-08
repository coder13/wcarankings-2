import { sqlFragment } from "@/lib/helpers/database/sql";
import type { GenderRankingQueryInput } from "@/services/rankings/types";

interface GenderPersonRankingRowsQueryInput {
  genderCount: number;
  positionColumn: string;
  regionColumn: string | null;
}

interface GenderPersonRankingLocateQueryInput {
  rankColumn: string;
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
  positionColumn,
  regionColumn,
}: GenderPersonRankingRowsQueryInput) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  const genderCondition = genderCount
    ? ` AND ranking.gender IN (${genderPlaceholders})`
    : "";
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
          ranking.continent_rank,
          ranking.country_rank,
          ranking.${positionColumn} AS page_position
        FROM
          person_event_rankings ranking
        WHERE
          ranking.event_id = ?
          AND ranking.result_type = ?
          ${genderCondition}${regionCondition}
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
      COALESCE(facts.competition_id, live.competition_id, '') AS competition_id,
      COALESCE(competition.name, '') AS competition_name,
      page.world_rank = 1 AS is_world_record,
      page.continent_rank = 1 AS is_continent_record,
      page.country_rank = 1 AS is_country_record
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = page.result_id
      LEFT JOIN provisional_live_results live
        ON -CAST(live.projection_result_id AS SIGNED) = page.result_id
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition
        ON competition.id = COALESCE(facts.competition_id, live.competition_id)
    ORDER BY
      page.page_position,
      page.person_id
  `;
}

export function genderPersonRankingLocateQuery({
  rankColumn,
  positionColumn,
  regionColumn,
}: GenderPersonRankingLocateQueryInput) {
  return sqlFragment`
    SELECT
      ranking.${rankColumn} AS rank,
      ranking.${positionColumn} AS sub_rank,
      ranking.person_id,
      ranking.result_id,
      ranking.result_value AS best,
      ranking.country_id,
      ranking.continent_id,
      COALESCE(person.name, ranking.person_id) AS person_name,
      COALESCE(country.name, ranking.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(facts.competition_id, live.competition_id, '') AS competition_id,
      COALESCE(competition.name, '') AS competition_name,
      ranking.world_rank = 1 AS is_world_record,
      ranking.continent_rank = 1 AS is_continent_record,
      ranking.country_rank = 1 AS is_country_record
    FROM person_event_rankings ranking
    LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
    LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
    LEFT JOIN provisional_live_results live
      ON -CAST(live.projection_result_id AS SIGNED) = ranking.result_id
    LEFT JOIN countries country ON country.id = ranking.country_id
    LEFT JOIN competitions competition
      ON competition.id = COALESCE(facts.competition_id, live.competition_id)
    WHERE ranking.event_id = ?
      AND ranking.result_type = ?
      AND ranking.person_id = ?
      ${regionColumn ? `AND ranking.${regionColumn} = ?` : ""}
    LIMIT 1
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
  const genderCondition = genderCount
    ? ` AND ranking.gender IN (${genderPlaceholders})`
    : "";
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      person_event_rankings ranking
    WHERE
      ranking.event_id = ?
      AND ranking.result_type = ?
      ${genderCondition}${regionColumn ? ` AND ranking.${regionColumn} = ?` : ""}
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
  const genderCondition = genderCount
    ? ` AND ranking.gender IN (${genderPlaceholders})`
    : "";
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      person_event_rankings ranking
    WHERE
      ranking.event_id = ?
      AND ranking.result_type = ?
      ${genderCondition}
      AND ranking.result_value < ? ${
        regionColumn ? ` AND ranking.${regionColumn} = ?` : ""
      }
  `;
}
