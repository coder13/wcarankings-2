import { sqlFragment } from "@/lib/helpers/database/sql";
import type {
  FilteredPersonMetricQueryInput,
  PersonMetricQueryInput,
} from "@/services/rankings/types";

export function personMetricQuery(input: PersonMetricQueryInput) {
  return sqlFragment`
    SELECT
      score.${input.rankColumn} AS rank,
      score.${input.positionColumn} AS sub_rank,
      score.person_id,
      COALESCE(person.name, score.person_id) AS person_name,
      COALESCE(display_country.id, '') AS country_id,
      COALESCE(display_country.name, display_country.id, '') AS country_name,
      COALESCE(display_country.iso2, '') AS country_iso2,
      COALESCE(display_country.continent_id, '') AS continent_id,
      ${input.scoreExpression} AS best
    FROM
      person_sum_of_ranks_scores score
      LEFT JOIN persons person ON person.wca_id = score.person_id
      AND person.sub_id = 1
      LEFT JOIN countries current_country ON current_country.id = person.country_id
      LEFT JOIN countries display_country ON display_country.id = CASE
        WHEN ? = 'country' THEN ?
        WHEN ? = 'continent'
        AND current_country.continent_id <> ? THEN NULL
        ELSE person.country_id
      END
    WHERE
      ${input.conditions.join(" AND ")}
    ORDER BY
      score.${input.positionColumn},
      score.person_id
    LIMIT
      ?
  `;
}

export function personMetricEndQuery(positionColumn: string) {
  return sqlFragment`
    SELECT
      ${positionColumn} AS position
    FROM
      person_sum_of_ranks_scores
    WHERE
      metric_version = 1
      AND event_set_version = 1
      AND result_type = ?
      AND scope = ?
      AND region_id = ?
      AND ${positionColumn} IS NOT NULL
    ORDER BY
      ${positionColumn} DESC
    LIMIT
      1
  `;
}

export function filteredPersonMetricQuery(
  input: FilteredPersonMetricQueryInput,
) {
  return sqlFragment`
    WITH
      filtered AS (
        SELECT
          score.person_id,
          ${input.scoreValue} AS best,
          DENSE_RANK() OVER (
            ORDER BY
              ${input.scoreOrder}
          ) AS filtered_rank,
          ROW_NUMBER() OVER (
            ORDER BY
              ${input.scoreOrder},
              score.person_id
          ) AS filtered_position,
          COUNT(*) OVER () AS total_count
        FROM
          person_sum_of_ranks_scores score
        WHERE
          ${input.conditions.join(" AND ")}
      ),
      page AS (
        SELECT
          *
        FROM
          filtered
        WHERE
          ${input.pageConditions.join(" AND ")}
        ORDER BY
          filtered_position
        LIMIT
          ?
      )
    SELECT
      page.filtered_rank AS rank,
      page.filtered_position AS sub_rank,
      page.total_count,
      page.person_id,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(display_country.id, '') AS country_id,
      COALESCE(display_country.name, display_country.id, '') AS country_name,
      COALESCE(display_country.iso2, '') AS country_iso2,
      COALESCE(display_country.continent_id, '') AS continent_id,
      page.best
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries current_country ON current_country.id = person.country_id
      LEFT JOIN countries display_country ON display_country.id = CASE
        WHEN ? = 'country' THEN ?
        WHEN ? = 'continent'
        AND current_country.continent_id <> ? THEN NULL
        ELSE person.country_id
      END
    ORDER BY
      page.filtered_position
  `;
}
