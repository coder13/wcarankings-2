import { sqlFragment } from "@/lib/helpers/database/sql";

interface PersonResultQueryInput {
  source: "result_rankings_single" | "result_rankings_average";
  hasStoredDate: boolean;
  year?: number | null;
}

export function personEventResultRankingsQuery({
  source,
  hasStoredDate,
  year = null,
}: PersonResultQueryInput) {
  const competitionStartDate = hasStoredDate
    ? "ranking.competition_start_date"
    : "NULL";
  const positionOrder = hasStoredDate
    ? "ranking.result_value, ranking.competition_start_date, ranking.competition_id, ranking.result_id, ranking.attempt_number"
    : "ranking.result_value, ranking.result_id";
  const yearJoin =
    !hasStoredDate && year !== null
      ? "INNER JOIN result_facts year_facts ON year_facts.result_id = ranking.result_id"
      : "";
  let yearCondition = "";
  if (year !== null) {
    yearCondition = hasStoredDate
      ? "AND YEAR(ranking.competition_start_date) = ?"
      : "AND YEAR(year_facts.competition_start_date) = ?";
  }

  return sqlFragment`
    WITH
      ranked AS (
        SELECT
          ranking.result_id,
          ranking.attempt_number,
          ranking.result_value,
          ranking.person_id,
          ranking.country_id,
          ranking.continent_id,
          ranking.competition_id,
          CASE
            WHEN ranking.world_rank = 1 THEN 'WR'
            WHEN ranking.continent_rank = 1 THEN 'CR'
            WHEN ranking.country_rank = 1 THEN 'NR'
            ELSE ''
          END AS record_code,
          ${competitionStartDate} AS competition_start_date,
          RANK() OVER (
            ORDER BY
              ranking.result_value
          ) AS rank,
          ROW_NUMBER() OVER (
            ORDER BY
              ${positionOrder}
          ) AS position,
          COUNT(*) OVER () AS total_count
        FROM
          ${source} ranking
          ${yearJoin}
        WHERE
          ranking.person_id = ?
          AND ranking.event_id = ?
          ${yearCondition}
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
      COALESCE(country.name, page.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(facts.competition_start_date, page.competition_start_date) AS competition_start_date
    FROM
      page
      LEFT JOIN persons person ON person.wca_id = page.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = page.country_id
      LEFT JOIN competitions competition ON competition.id = page.competition_id
      LEFT JOIN result_facts facts ON facts.result_id = page.result_id
    ORDER BY
      page.position
  `;
}

export function personEventResultProgressQuery({
  source,
  hasStoredDate,
  year = null,
}: PersonResultQueryInput) {
  const competitionStartDate = hasStoredDate
    ? "ranking.competition_start_date"
    : "facts.competition_start_date";
  const factsJoin = hasStoredDate
    ? ""
    : "INNER JOIN result_facts facts ON facts.result_id = ranking.result_id";
  const yearCondition =
    year === null ? "" : `AND YEAR(${competitionStartDate}) = ?`;

  return sqlFragment`
    WITH
      competition_bests AS (
        SELECT
          ranking.competition_id,
          ${competitionStartDate} AS competition_start_date,
          MIN(ranking.result_value) AS result_value
        FROM
          ${source} ranking
          ${factsJoin}
        WHERE
          ranking.person_id = ?
          AND ranking.event_id = ?
          ${yearCondition}
        GROUP BY
          ranking.competition_id,
          ${competitionStartDate}
      ),
      running_bests AS (
        SELECT
          competition_id,
          competition_start_date,
          result_value,
          MIN(result_value) OVER (
            ORDER BY
              competition_start_date,
              competition_id
          ) AS best_value
        FROM
          competition_bests
      ),
      improvements AS (
        SELECT
          competition_id,
          competition_start_date,
          best_value,
          LAG(best_value) OVER (
            ORDER BY
              competition_start_date,
              competition_id
          ) AS previous_best_value
        FROM
          running_bests
      )
    SELECT
      improvements.competition_id,
      improvements.competition_start_date,
      improvements.best_value AS result_value,
      COALESCE(competition.name, improvements.competition_id) AS competition_name
    FROM
      improvements
      LEFT JOIN competitions competition ON competition.id = improvements.competition_id
    WHERE
      improvements.previous_best_value IS NULL
      OR improvements.best_value < improvements.previous_best_value
    ORDER BY
      improvements.competition_start_date,
      improvements.competition_id
  `;
}
