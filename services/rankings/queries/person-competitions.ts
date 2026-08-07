import { sqlFragment } from "@/lib/helpers/database/sql";
import type { PersonCompetitionRankingInput } from "@/services/rankings/types";

interface PersonCompetitionQueryPlan {
  rowsQuery: string;
  countQuery: string;
  values: unknown[];
}

function lazyConditions(input: PersonCompetitionRankingInput) {
  const conditions = ["counts.competition_count > 0"];
  const values: unknown[] = [];
  conditions.push(
    input.year === null ? "counts.period_year = 0" : "counts.period_year = ?",
  );
  if (input.year !== null) values.push(input.year);
  if (input.scope === "continent") {
    conditions.push("country.continent_id = ?");
    values.push(input.regionId);
  }
  if (input.scope === "country") {
    conditions.push("person.country_id = ?");
    values.push(input.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `counts.person_gender IN (${input.gender.map(() => "?").join(", ")})`,
    );
    values.push(...input.gender);
  }
  return { conditions, values };
}

function lazyDimensionJoins(input: PersonCompetitionRankingInput) {
  if (input.scope === "continent") {
    return `INNER JOIN persons person ON person.wca_id = counts.person_id
        AND person.sub_id = 1
      INNER JOIN countries country ON country.id = person.country_id`;
  }
  if (input.scope === "country") {
    return `INNER JOIN persons person ON person.wca_id = counts.person_id
        AND person.sub_id = 1`;
  }
  return "";
}

function lazySource(input: PersonCompetitionRankingInput) {
  return "person_period_metrics";
}

export function personCompetitionRankingRowsQuery() {
  return sqlFragment`
    WITH
      page AS (
        SELECT
          ranking.person_id,
          ranking.competition_count,
          ranking.rank,
          ranking.position
        FROM
          person_competition_rankings ranking
        WHERE
          ranking.scope = ?
          AND ranking.region_id = ?
          AND ranking.gender = ?
          AND ranking.position >= ?
        ORDER BY
          ranking.position,
          ranking.person_id
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
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

export function personCompetitionRankingCountQuery() {
  return sqlFragment`
    SELECT COUNT(*) AS count
    FROM person_competition_rankings
    WHERE scope = ? AND region_id = ? AND gender = ?
  `;
}

export function buildLazyPersonCompetitionQueryPlan(
  input: PersonCompetitionRankingInput,
): PersonCompetitionQueryPlan {
  const { conditions, values } = lazyConditions(input);
  const source = lazySource(input);
  const joins = lazyDimensionJoins(input);
  const predicate = conditions.join(" AND ");
  const rowsQuery = sqlFragment`
      WITH
      filtered AS (
        SELECT
          counts.person_id,
          counts.competition_count
        FROM
          ${source} counts ${joins}
        WHERE
          ${predicate}
      ),
      ranked AS (
        SELECT
          filtered.*,
          RANK() OVER (
            ORDER BY
              competition_count DESC
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              competition_count DESC,
              person_id
          ) AS position
        FROM
          filtered
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
      ${source} counts ${joins}
    WHERE
      ${predicate}
  `;

  return { rowsQuery, countQuery, values };
}
