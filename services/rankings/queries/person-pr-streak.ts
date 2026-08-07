import { sqlFragment } from "@/lib/helpers/database/sql";
import type { PersonPrStreakRankingInput } from "@/services/rankings/types";

interface PersonPrStreakQueryPlan {
  rowsQuery: string;
  countQuery: string;
  values: unknown[];
}

interface PersonPrStreakSelectionPlan {
  query: string;
  values: unknown[];
}

function lazySource(input: PersonPrStreakRankingInput) {
  return input.year === null
    ? "person_pr_streak_counts"
    : "person_pr_streak_year_counts";
}

function lazyFilter(input: PersonPrStreakRankingInput) {
  const conditions = ["score.pr_streak >= 2"];
  const values: unknown[] = [];
  if (input.year !== null) {
    conditions.push("score.year = ?");
    values.push(input.year);
  }
  if (input.scope === "continent") {
    conditions.push("score.continent_id = ?");
    values.push(input.regionId);
  } else if (input.scope === "country") {
    conditions.push("score.country_id = ?");
    values.push(input.regionId);
  }
  if (input.gender.length) {
    conditions.push(
      `score.person_gender IN (${input.gender.map(() => "?").join(", ")})`,
    );
    values.push(...input.gender);
  }
  return { predicate: conditions.join(" AND "), values };
}

function displayColumns() {
  return sqlFragment`
    ranked.*,
    COALESCE(person.name, ranked.person_id) AS person_name,
    COALESCE(ranked.country_id, '') AS country_id,
    COALESCE(country.name, ranked.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2
  `;
}

function lazyRankedCtes(input: PersonPrStreakRankingInput) {
  const source = lazySource(input);
  const { predicate, values } = lazyFilter(input);
  return {
    ctes: sqlFragment`
      filtered AS (
        SELECT
          score.person_id,
          score.country_id,
          score.pr_streak
        FROM
          ${source} score
        WHERE
          ${predicate}
      ),
      ranked AS (
        SELECT
          filtered.*,
          RANK() OVER (
            ORDER BY
              pr_streak DESC
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              pr_streak DESC,
              person_id
          ) AS position
        FROM
          filtered
      )
    `,
    values,
  };
}

export function personPrStreakRankingRowsQuery() {
  return sqlFragment`
    WITH
      page AS (
        SELECT
          ranking.person_id,
          ranking.pr_streak,
          ranking.rank,
          ranking.position
        FROM
          person_pr_streak_rankings ranking
        WHERE
          ranking.scope = ?
          AND ranking.region_id = ?
          AND ranking.gender = ?
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

export function personPrStreakRankingCountQuery() {
  return sqlFragment`
    SELECT
      count
    FROM
      person_pr_streak_ranking_counts
    WHERE
      scope = ?
      AND region_id = ?
      AND gender = ?
  `;
}

export function buildLazyPersonPrStreakQueryPlan(
  input: PersonPrStreakRankingInput,
): PersonPrStreakQueryPlan {
  const source = lazySource(input);
  const { ctes, values } = lazyRankedCtes(input);
  return {
    rowsQuery: sqlFragment`
      WITH
        ${ctes},
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
        ${displayColumns()}
      FROM
        page ranked
        LEFT JOIN persons person ON person.wca_id = ranked.person_id
        AND person.sub_id = 1
        LEFT JOIN countries country ON country.id = ranked.country_id
      ORDER BY
        ranked.position,
        ranked.person_id
    `,
    countQuery: sqlFragment`
      SELECT
        COUNT(*) AS count
      FROM
        ${source} score
      WHERE
        ${lazyFilter(input).predicate}
    `,
    values,
  };
}

export function eagerPersonPrStreakSelectionQuery(
  personIds: readonly string[],
): string {
  const placeholders = personIds.map(() => "?").join(", ");
  return sqlFragment`
    SELECT
      ranking.person_id,
      ranking.pr_streak,
      ranking.rank,
      ranking.position,
      COALESCE(person.name, ranking.person_id) AS person_name,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM
      person_pr_streak_rankings ranking
      LEFT JOIN persons person ON person.wca_id = ranking.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
    WHERE
      ranking.scope = ?
      AND ranking.region_id = ?
      AND ranking.gender = ?
      AND ranking.person_id IN (${placeholders})
    ORDER BY
      ranking.position,
      ranking.person_id
  `;
}

export function buildLazyPersonPrStreakSelectionPlan(
  input: PersonPrStreakRankingInput,
  personIds: readonly string[],
): PersonPrStreakSelectionPlan {
  const placeholders = personIds.map(() => "?").join(", ");
  const { ctes, values } = lazyRankedCtes(input);
  return {
    query: sqlFragment`
      WITH
        ${ctes}
      SELECT
        ${displayColumns()}
      FROM
        ranked
        LEFT JOIN persons person ON person.wca_id = ranked.person_id
        AND person.sub_id = 1
        LEFT JOIN countries country ON country.id = ranked.country_id
      WHERE
        ranked.person_id IN (${placeholders})
      ORDER BY
        ranked.position,
        ranked.person_id
    `,
    values: [...values, ...personIds],
  };
}
