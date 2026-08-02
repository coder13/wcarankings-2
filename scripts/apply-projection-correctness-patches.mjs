import { writeFile } from "node:fs/promises";

await writeFile("sql/ranking-projections/result_facts.sql", `CREATE TABLE result_facts AS
SELECT
  r.id AS result_id,
  r.event_id,
  r.person_id,
  r.person_country_id,
  COALESCE(country.continent_id, '') AS person_continent_id,
  r.competition_id,
  comp.year AS competition_year,
  STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
  r.round_type_id,
  COALESCE(round_type.final, 0) AS is_final_round,
  r.pos AS position,
  r.best,
  r.average,
  COALESCE(format.expected_solve_count, 0) AS attempt_count,
  COALESCE(r.regional_single_record, '') AS regional_single_record,
  COALESCE(r.regional_average_record, '') AS regional_average_record
FROM results r
INNER JOIN competitions comp ON comp.id = r.competition_id
LEFT JOIN countries country ON country.id = r.person_country_id
LEFT JOIN round_types round_type ON round_type.id = r.round_type_id
LEFT JOIN formats format ON format.id = r.format_id;

ALTER TABLE result_facts
  ADD PRIMARY KEY (result_id),
  ADD INDEX idx_result_facts_person_event_date (person_id, event_id, competition_start_date, result_id),
  ADD INDEX idx_result_facts_competition_event (competition_id, event_id, result_id),
  ADD INDEX idx_result_facts_year_single (competition_year, event_id, person_id, person_country_id, best, result_id),
  ADD INDEX idx_result_facts_year_average (competition_year, event_id, person_id, person_country_id, average, result_id),
  ADD INDEX idx_result_facts_single_ranking_cover (
    event_id, best, competition_start_date, competition_id, person_id,
    result_id, round_type_id, person_country_id, person_continent_id
  ),
  ADD INDEX idx_result_facts_average_ranking_cover (
    event_id, average, competition_start_date, competition_id, person_id,
    result_id, round_type_id, person_country_id, person_continent_id
  );
`);

function rankingSource(resultType) {
  const value = resultType === "single" ? "best" : "average";
  const rankTable = resultType === "single" ? "ranks_single" : "ranks_average";
  const bestView = resultType === "single" ? "wca_best_single" : "wca_best_average";
  const record = resultType === "single" ? "regional_single_record" : "regional_average_record";
  return `CREATE OR REPLACE VIEW ranking_entries_${resultType}_source AS
WITH historical AS (
  SELECT
    r.event_id,
    r.person_id,
    COALESCE(r.person_country_id, '') AS country_id,
    r.person_continent_id AS continent_id,
    r.${value} AS best,
    r.competition_id,
    r.${record} AS regional_record,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, COALESCE(r.person_country_id, '')
      ORDER BY r.${value}, r.result_id
    ) AS country_person_position,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, r.person_continent_id
      ORDER BY r.${value}, r.result_id
    ) AS continent_person_position
  FROM result_facts r
  WHERE r.${value} > 0
), country_rows AS (
  SELECT
    historical.event_id, historical.person_id,
    COALESCE(person.name, historical.person_id) AS person_name,
    historical.country_id,
    COALESCE(country.name, historical.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    historical.continent_id, historical.best,
    historical.competition_id,
    COALESCE(comp.name, historical.competition_id, '') AS competition_name,
    0 AS world_rank, 0 AS continent_rank,
    RANK() OVER (PARTITION BY historical.event_id, historical.country_id ORDER BY historical.best) AS country_rank,
    0 AS world_sub_rank, 0 AS continent_sub_rank,
    ROW_NUMBER() OVER (
      PARTITION BY historical.event_id, historical.country_id
      ORDER BY historical.best, COALESCE(person.name, historical.person_id), historical.person_id
    ) AS country_sub_rank,
    historical.regional_record = 'WR' AS is_world_record,
    historical.regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    historical.regional_record = 'NR' AS is_country_record
  FROM historical
  LEFT JOIN persons person ON person.wca_id = historical.person_id AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = historical.country_id
  LEFT JOIN competitions comp ON comp.id = historical.competition_id
  WHERE historical.country_person_position = 1
), continent_rows AS (
  SELECT
    historical.event_id, historical.person_id,
    COALESCE(person.name, historical.person_id) AS person_name,
    historical.country_id,
    COALESCE(country.name, historical.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    historical.continent_id, historical.best,
    historical.competition_id,
    COALESCE(comp.name, historical.competition_id, '') AS competition_name,
    0 AS world_rank,
    RANK() OVER (PARTITION BY historical.event_id, historical.continent_id ORDER BY historical.best) AS continent_rank,
    0 AS country_rank, 0 AS world_sub_rank,
    ROW_NUMBER() OVER (
      PARTITION BY historical.event_id, historical.continent_id
      ORDER BY historical.best, COALESCE(person.name, historical.person_id), historical.person_id
    ) AS continent_sub_rank,
    0 AS country_sub_rank,
    historical.regional_record = 'WR' AS is_world_record,
    historical.regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    historical.regional_record = 'NR' AS is_country_record
  FROM historical
  LEFT JOIN persons person ON person.wca_id = historical.person_id AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = historical.country_id
  LEFT JOIN competitions comp ON comp.id = historical.competition_id
  WHERE historical.continent_person_position = 1
), world_rows AS (
  SELECT
    ranking.event_id, ranking.person_id,
    COALESCE(person.name, ranking.person_id) AS person_name,
    COALESCE(person.country_id, '') AS country_id,
    COALESCE(country.name, person.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    COALESCE(country.continent_id, '') AS continent_id,
    ranking.best, COALESCE(best.competition_id, '') AS competition_id,
    COALESCE(comp.name, '') AS competition_name,
    ranking.world_rank, 0 AS continent_rank, 0 AS country_rank,
    SUM(ranking.world_rank > 0) OVER (
      PARTITION BY ranking.event_id
      ORDER BY ranking.world_rank, COALESCE(person.name, ranking.person_id), ranking.person_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS world_sub_rank,
    0 AS continent_sub_rank, 0 AS country_sub_rank,
    ranking.world_rank = 1 AS is_world_record,
    ranking.continent_rank = 1 AS is_continent_record,
    ranking.country_rank = 1 AS is_country_record
  FROM ${rankTable} ranking
  LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
  LEFT JOIN ${bestView} best ON best.person_id = ranking.person_id AND best.event_id = ranking.event_id
  LEFT JOIN competitions comp ON comp.id = best.competition_id
)
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM world_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM country_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM continent_rows;
`;
}
await writeFile("sql/ranking-projections/ranking_entries_single_source.sql", rankingSource("single"));
await writeFile("sql/ranking-projections/ranking_entries_average_source.sql", rankingSource("average"));

await writeFile("sql/ranking-projections/person_competition_rankings.sql", `-- phase: count each person's distinct competitions
CREATE TABLE person_competition_counts AS
SELECT facts.person_id, COUNT(DISTINCT facts.competition_id) AS competition_count
FROM result_facts facts
INNER JOIN persons person
  ON person.wca_id = facts.person_id
 AND person.sub_id = 1
GROUP BY facts.person_id;

ALTER TABLE person_competition_counts ADD PRIMARY KEY (person_id);

CREATE TABLE person_competition_rankings AS
WITH people AS (
  SELECT counts.person_id, counts.competition_count, person.country_id,
    COALESCE(country.continent_id, '') AS continent_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender
  FROM person_competition_counts counts
  INNER JOIN persons person ON person.wca_id = counts.person_id AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
), cohorts AS (
  SELECT person_id, competition_count, 'world' AS scope, '' AS region_id, 'all' AS gender FROM people
  UNION ALL SELECT person_id, competition_count, 'world', '', person_gender FROM people
  UNION ALL SELECT person_id, competition_count, 'continent', continent_id, 'all' FROM people WHERE continent_id <> ''
  UNION ALL SELECT person_id, competition_count, 'continent', continent_id, person_gender FROM people WHERE continent_id <> ''
  UNION ALL SELECT person_id, competition_count, 'country', country_id, 'all' FROM people WHERE country_id <> ''
  UNION ALL SELECT person_id, competition_count, 'country', country_id, person_gender FROM people WHERE country_id <> ''
)
SELECT person_id, competition_count, scope, region_id, gender,
  RANK() OVER (PARTITION BY scope, region_id, gender ORDER BY competition_count DESC) AS rank,
  ROW_NUMBER() OVER (PARTITION BY scope, region_id, gender ORDER BY competition_count DESC, person_id) AS position
FROM cohorts;

ALTER TABLE person_competition_rankings
  ADD PRIMARY KEY (scope, region_id, gender, person_id),
  ADD INDEX idx_person_competition_rankings_page (scope, region_id, gender, position, person_id);

CREATE TABLE person_competition_ranking_counts AS
SELECT scope, region_id, gender, COUNT(*) AS count
FROM person_competition_rankings GROUP BY scope, region_id, gender;

ALTER TABLE person_competition_ranking_counts ADD PRIMARY KEY (scope, region_id, gender);
`);

await writeFile("sql/ranking-projections/city_event_stats.sql", `CREATE TABLE city_event_stats AS
WITH attempt_counts AS (
  SELECT result_id, COUNT(CASE WHEN value > 0 THEN 1 END) AS official_solve_count
  FROM result_attempts
  GROUP BY result_id
), base AS (
  SELECT facts.*, comp.city_name, comp.country_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender,
    COALESCE(attempts.official_solve_count, 0) AS official_solve_count
  FROM result_facts facts
  INNER JOIN competitions comp ON comp.id = facts.competition_id
  LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  LEFT JOIN attempt_counts attempts ON attempts.result_id = facts.result_id
  WHERE comp.city_name <> ''
), scoped AS (
  SELECT base.*, base.person_gender AS gender FROM base
  UNION ALL
  SELECT base.*, 'all' AS gender FROM base
), aggregates AS (
  SELECT city_name, country_id, event_id, gender,
    MIN(CASE WHEN best > 0 THEN best END) AS fastest_single,
    MIN(CASE WHEN average > 0 THEN average END) AS fastest_average,
    COUNT(DISTINCT person_id) AS competitor_count,
    COUNT(DISTINCT competition_id) AS competition_count,
    SUM(official_solve_count) AS official_solve_count
  FROM scoped
  GROUP BY city_name, country_id, event_id, gender
), winner_candidates AS (
  SELECT scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender, scoped.result_id,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    ) AS single_choice,
    0 AS average_choice
  FROM scoped
  INNER JOIN aggregates USING (city_name, country_id, event_id, gender)
  WHERE scoped.best = aggregates.fastest_single
  UNION ALL
  SELECT scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender, scoped.result_id,
    0,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    )
  FROM scoped
  INNER JOIN aggregates USING (city_name, country_id, event_id, gender)
  WHERE scoped.average = aggregates.fastest_average
), winners AS (
  SELECT city_name, country_id, event_id, gender,
    MAX(CASE WHEN single_choice = 1 THEN result_id END) AS fastest_single_result_id,
    MAX(CASE WHEN average_choice = 1 THEN result_id END) AS fastest_average_result_id
  FROM winner_candidates
  GROUP BY city_name, country_id, event_id, gender
)
SELECT aggregates.city_name, aggregates.country_id, aggregates.event_id, aggregates.gender,
  aggregates.fastest_single, winners.fastest_single_result_id,
  aggregates.fastest_average, winners.fastest_average_result_id,
  aggregates.competitor_count, aggregates.competition_count, aggregates.official_solve_count,
  CASE WHEN fastest_single IS NOT NULL THEN
    DENSE_RANK() OVER (PARTITION BY event_id, gender ORDER BY fastest_single)
  END AS fastest_single_rank,
  CASE WHEN fastest_average IS NOT NULL THEN
    DENSE_RANK() OVER (PARTITION BY event_id, gender ORDER BY fastest_average)
  END AS fastest_average_rank
FROM aggregates
INNER JOIN winners USING (city_name, country_id, event_id, gender);

ALTER TABLE city_event_stats
  ADD PRIMARY KEY (city_name, country_id, event_id, gender),
  ADD INDEX idx_city_event_single (event_id, gender, fastest_single, country_id, city_name),
  ADD INDEX idx_city_event_average (event_id, gender, fastest_average, country_id, city_name),
  ADD INDEX idx_city_event_competitors (event_id, gender, competitor_count, country_id, city_name),
  ADD INDEX idx_city_event_competitions (event_id, gender, competition_count, country_id, city_name),
  ADD INDEX idx_city_event_solves (event_id, gender, official_solve_count, country_id, city_name);
`);
