import { sqlFragment } from "@/lib/helpers/database/sql";
import type {
  RankingCursorQueryInput,
  RankingPageQueryInput,
  RankingSearchQueryInput,
} from "@/services/rankings/types";

export function yearlyRankingPageQuery(
  table: string,
  columns: string,
  conditions: string[],
) {
  return sqlFragment`
    SELECT
      ${columns}
    FROM
      ${table} ranking
      LEFT JOIN persons person ON person.wca_id = ranking.person_id
      AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
      LEFT JOIN countries country ON country.id = facts.person_country_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
    WHERE
      ${conditions.join(" AND ")}
      AND ranking.position >= ?
      AND ranking.position < ?
    ORDER BY
      ranking.position
  `;
}

export function filteredYearlyRankingPageQuery(
  table: string,
  conditions: string[],
) {
  return sqlFragment`
    WITH
      candidates AS (
        SELECT
          ranking.person_id,
          ranking.result_id,
          ranking.result_value,
          COALESCE(person.name, ranking.person_id) AS person_name,
          COALESCE(country.id, '') AS country_id,
          COALESCE(country.name, country.id, '') AS country_name,
          COALESCE(country.iso2, '') AS country_iso2,
          COALESCE(country.continent_id, '') AS continent_id,
          COALESCE(facts.competition_id, '') AS competition_id,
          COALESCE(competition.name, '') AS competition_name,
          facts.competition_start_date,
          COALESCE(facts.round_type_id, '') AS round_type_id,
          facts.regional_single_record,
          facts.regional_average_record
        FROM
          ${table} ranking
          JOIN persons person ON person.wca_id = ranking.person_id
          AND person.sub_id = 1
          LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
          LEFT JOIN countries country ON country.id = facts.person_country_id
          LEFT JOIN competitions competition ON competition.id = facts.competition_id
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
              person_id
          ) AS sub_rank,
          COUNT(*) OVER () AS total_count
        FROM
          candidates
      )
    SELECT
      rank,
      sub_rank,
      total_count,
      person_id,
      person_name,
      country_id,
      country_name,
      country_iso2,
      continent_id,
      result_value AS best,
      competition_id,
      competition_name,
      regional_single_record = 'WR'
      OR regional_average_record = 'WR' AS is_world_record,
      regional_single_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR')
      OR regional_average_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      regional_single_record = 'NR'
      OR regional_average_record = 'NR' AS is_country_record
    FROM
      ranked
    WHERE
      sub_rank >= ?
      AND sub_rank < ?
    ORDER BY
      sub_rank
  `;
}

export function rankingPageQuery(
  table: string,
  columns: string,
  conditions: string[],
  subRank: string,
) {
  return sqlFragment`
    SELECT
      ${columns}
    FROM
      ${table}
    WHERE
      ${conditions.join(" AND ")}
      AND ${subRank} >= ?
      AND ${subRank} < ?
    ORDER BY
      ${subRank}
  `;
}

export function rankingLocateQuery(input: RankingPageQueryInput) {
  return sqlFragment`
    SELECT
      ${input.selectColumns} ${input.from}
    WHERE
      ${input.predicate}
      AND ${input.personColumn} = ?
    LIMIT
      1
  `;
}

export function rankingSearchQuery(input: RankingSearchQueryInput) {
  const placeholders = input.personIds.map(() => "?").join(", ");
  return sqlFragment`
    SELECT
      ${input.selectColumns} ${input.from}
    WHERE
      ${input.predicate}
      AND ${input.personColumn} IN (${placeholders})
    ORDER BY
      ${input.qualifiedSubRank}
    LIMIT
      ?
  `;
}

export function rankingCursorQuery(input: RankingCursorQueryInput) {
  return sqlFragment`
    SELECT
      ${input.selectColumns} ${input.from}
    WHERE
      ${input.predicate}${input.cursor}
    ORDER BY
      ${input.qualifiedSubRank}
    LIMIT
      ?
  `;
}
