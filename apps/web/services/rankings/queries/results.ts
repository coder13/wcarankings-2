import { sqlFragment } from "@/lib/helpers/database/sql";
import type { ResultRankingsQueryInput } from "@/services/rankings/types";

interface FilteredResultRankingsQueryInput {
  source: string;
  joins?: string;
  candidateColumns: string;
  conditions: string[];
}

export function resultRankingsQuery(input: ResultRankingsQueryInput) {
  return sqlFragment`
    WITH
      page AS (
        SELECT
          ranking.result_id,
          ranking.attempt_number,
          ranking.result_value,
          ranking.${input.rankColumn} AS rank,
          ranking.${input.positionColumn} AS position,
          ranking.person_id,
          ranking.country_id,
          ranking.continent_id,
          ranking.competition_id,
          CASE
            WHEN ranking.country_rank = 1 THEN 'NR'
            WHEN ranking.continent_rank = 1 THEN 'CR'
            WHEN ranking.world_rank = 1 THEN 'WR'
            ELSE ''
          END AS record_code
        FROM
          ${input.source} ranking
        WHERE
          ${input.conditions.join(" AND ")}
        ORDER BY
          ranking.${input.positionColumn}
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition ON competition.id = page.competition_id
    ORDER BY
      page.position
  `;
}

export function resultRankingCountsQuery(resultType: "single" | "average") {
  const table =
    resultType === "single"
      ? "result_rankings_single"
      : "result_rankings_average";
  return sqlFragment`
    SELECT COUNT(*) AS count
    FROM ${table} ranking
    WHERE ranking.event_id = ?
      AND (
        (? = 'world' AND ? = '')
        OR (? = 'continent' AND ranking.continent_id = ?)
        OR (? = 'country' AND ranking.country_id = ?)
      )
  `;
}

export function lazySingleResultRankingsQuery(conditions: string[]) {
  return sqlFragment`
    WITH
      scoped AS (
        SELECT
          solve.*,
          RANK() OVER (
            ORDER BY
              solve.result_value
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              solve.result_value,
              solve.competition_start_date,
              solve.competition_id,
              solve.result_id,
              solve.attempt_number
          ) AS position,
          COUNT(*) OVER () AS total_count
        FROM
          result_rankings_single solve
        WHERE
          ${conditions.join(" AND ")}
      ),
      page AS (
        SELECT
          *
        FROM
          scoped
        WHERE
          position > ?
        ORDER BY
          position
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition ON competition.id = page.competition_id
    ORDER BY
      page.position
  `;
}

export function filteredResultRankingsQuery({
  source,
  joins = "",
  candidateColumns,
  conditions,
}: FilteredResultRankingsQueryInput) {
  return sqlFragment`
    WITH
      candidates AS (
        SELECT
          ${candidateColumns}
        FROM
          ${source} ${joins}
        WHERE
          ${conditions.join(" AND ")}
      ),
      ranked AS (
        SELECT
          candidates.*,
          RANK() OVER (
            ORDER BY
              result_value
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              result_value,
              competition_start_date,
              competition_id,
              result_id,
              COALESCE(attempt_number, 0)
          ) AS position,
          COUNT(*) OVER () AS total_count
        FROM
          candidates
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM
      ranked page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition ON competition.id = page.competition_id
    WHERE
      page.position > ?
    ORDER BY
      page.position
    LIMIT
      ?
  `;
}
