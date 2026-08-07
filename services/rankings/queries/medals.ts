import { sqlFragment } from "@/lib/helpers/database/sql";
import type { MedalRankingInput } from "@/services/rankings/types";

interface MedalQueryPlan {
  rowsQuery: string;
  countQuery: string;
  values: unknown[];
}

function medalColumn(input: MedalRankingInput): string {
  if (input.medalType === "gold") return "gold_count";
  if (input.medalType === "silver") return "silver_count";
  if (input.medalType === "bronze") return "bronze_count";
  return "gold_count + silver_count + bronze_count";
}

function scoreConditions(input: MedalRankingInput) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.eventId !== null) {
    conditions.push("score.event_id = ?");
    values.push(input.eventId);
  }
  if (input.year !== null) {
    conditions.push("score.year = ?");
    values.push(input.year);
  }
  if (input.scope === "continent") {
    conditions.push("score.continent_id = ?");
    values.push(input.regionId);
  }
  if (input.scope === "country") {
    conditions.push("score.country_id = ?");
    values.push(input.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `score.person_gender IN (${input.gender.map(() => "?").join(", ")})`,
    );
    values.push(...input.gender);
  }
  return { conditions, values };
}

export function eagerMedalRowsQuery() {
  return sqlFragment`
    WITH
      page AS (
        SELECT
          ranking.person_id,
          ranking.medal_count,
          ranking.rank,
          ranking.position
        FROM
          person_medal_rankings ranking
        WHERE
          ranking.event_id = ?
          AND ranking.medal_type = ?
          AND ranking.scope = ?
          AND ranking.region_id = ?
          AND ranking.position >= ?
          AND ranking.position < ?
        ORDER BY
          ranking.position,
          ranking.person_id
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY
      page.position,
      page.person_id
  `;
}

export function eagerMedalCountQuery() {
  return sqlFragment`
    SELECT COUNT(*) AS count
    FROM person_medal_rankings
    WHERE event_id = ? AND medal_type = ? AND scope = ? AND region_id = ?
  `;
}

export function buildLazyMedalQueryPlan(
  input: MedalRankingInput,
): MedalQueryPlan {
  const { conditions, values } = scoreConditions(input);
  const predicate = conditions.length ? conditions.join(" AND ") : "1 = 1";
  const countColumn = medalColumn(input);
  const rowsQuery = sqlFragment`
    WITH
      totals AS (
        SELECT
          score.person_id,
          SUM(${countColumn}) AS medal_count
        FROM
          person_medal_scores score
        WHERE
          ${predicate}
        GROUP BY
          score.person_id
        HAVING
          SUM(${countColumn}) > 0
      ),
      ranked AS (
        SELECT
          totals.*,
          RANK() OVER (
            ORDER BY
              medal_count DESC
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              medal_count DESC,
              person_id
          ) AS position,
          COUNT(*) OVER () AS total_count
        FROM
          totals
      ),
      page AS (
        SELECT
          *
        FROM
          ranked
        WHERE
          position >= ?
          AND position < ?
        ORDER BY
          position
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY
      page.position,
      page.person_id
  `;
  const countQuery = sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      (
        SELECT
          score.person_id
        FROM
          person_medal_scores score
        WHERE
          ${predicate}
        GROUP BY
          score.person_id
        HAVING
          SUM(${countColumn}) > 0
      ) totals
  `;

  return { rowsQuery, countQuery, values };
}
