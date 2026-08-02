import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const content = await readFile(path, "utf8");
  if (!content.includes(before)) throw new Error(`Could not find expected content in ${path}`);
  await writeFile(path, content.replace(before, after));
}

async function replaceAll(path, before, after) {
  const content = await readFile(path, "utf8");
  if (!content.includes(before)) throw new Error(`Could not find expected content in ${path}`);
  await writeFile(path, content.replaceAll(before, after));
}

await replaceOnce(
  "scripts/projection-release-artifact.mjs",
  "    const metadataFile = `${prefix}-projection-transfer.json`;\n    const archiveFile = `${prefix}-projection-transfer.sql.gz`;\n    const transfer = JSON.parse(await readFile(join(directory, metadataFile), \"utf8\"));",
  "    const metadataFile = `${prefix}-projection-transfer.json`;\n    const transfer = JSON.parse(await readFile(join(directory, metadataFile), \"utf8\"));\n    const archiveFile = transfer.archiveFile || `${prefix}-projection-transfer.sql.gz`;",
);

await writeFile("sql/ranking-projections/result_facts.sql", `CREATE TABLE result_facts AS
SELECT
  r.id AS result_id,
  r.event_id,
  r.person_id,
  COALESCE(person.name, r.person_id) AS person_name,
  CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender,
  r.person_country_id,
  COALESCE(country.name, r.person_country_id, '') AS person_country_name,
  COALESCE(country.iso2, '') AS person_country_iso2,
  COALESCE(country.continent_id, '') AS person_continent_id,
  r.competition_id,
  COALESCE(comp.name, r.competition_id) AS competition_name,
  COALESCE(comp.city_name, '') AS city_name,
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
LEFT JOIN persons person ON person.wca_id = r.person_id AND person.sub_id = 1
LEFT JOIN countries country ON country.id = r.person_country_id
LEFT JOIN round_types round_type ON round_type.id = r.round_type_id
LEFT JOIN formats format ON format.id = r.format_id;

ALTER TABLE result_facts
  ADD PRIMARY KEY (result_id),
  ADD INDEX idx_result_facts_person_event_date (person_id, event_id, competition_start_date, result_id),
  ADD INDEX idx_result_facts_competition_event (competition_id, event_id, result_id),
  ADD INDEX idx_result_facts_city_event (city_name, person_country_id, event_id, person_gender, result_id),
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
    r.person_name,
    COALESCE(r.person_country_id, '') AS country_id,
    r.person_country_name AS country_name,
    r.person_country_iso2 AS country_iso2,
    r.person_continent_id AS continent_id,
    r.${value} AS best,
    r.competition_id,
    r.competition_name,
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
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank, 0 AS continent_rank,
    RANK() OVER (PARTITION BY event_id, country_id ORDER BY best) AS country_rank,
    0 AS world_sub_rank, 0 AS continent_sub_rank,
    ROW_NUMBER() OVER (PARTITION BY event_id, country_id ORDER BY best, person_name, person_id) AS country_sub_rank,
    regional_record = 'WR' AS is_world_record,
    regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    regional_record = 'NR' AS is_country_record
  FROM historical WHERE country_person_position = 1
), continent_rows AS (
  SELECT
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank,
    RANK() OVER (PARTITION BY event_id, continent_id ORDER BY best) AS continent_rank,
    0 AS country_rank, 0 AS world_sub_rank,
    ROW_NUMBER() OVER (PARTITION BY event_id, continent_id ORDER BY best, person_name, person_id) AS continent_sub_rank,
    0 AS country_sub_rank,
    regional_record = 'WR' AS is_world_record,
    regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    regional_record = 'NR' AS is_country_record
  FROM historical WHERE continent_person_position = 1
), world_rows AS (
  SELECT
    r.event_id, r.person_id, COALESCE(p.name, r.person_id) AS person_name,
    COALESCE(p.country_id, '') AS country_id,
    COALESCE(country.name, p.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    COALESCE(country.continent_id, '') AS continent_id,
    r.best, COALESCE(best.competition_id, '') AS competition_id,
    COALESCE(comp.name, '') AS competition_name,
    r.world_rank, 0 AS continent_rank, 0 AS country_rank,
    SUM(r.world_rank > 0) OVER (
      PARTITION BY r.event_id
      ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS world_sub_rank,
    0 AS continent_sub_rank, 0 AS country_sub_rank,
    r.world_rank = 1 AS is_world_record,
    r.continent_rank = 1 AS is_continent_record,
    r.country_rank = 1 AS is_country_record
  FROM ${rankTable} r
  LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
  LEFT JOIN countries country ON country.id = p.country_id
  LEFT JOIN ${bestView} best ON best.person_id = r.person_id AND best.event_id = r.event_id
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
SELECT person_id, COUNT(DISTINCT competition_id) AS competition_count
FROM result_facts
GROUP BY person_id;

ALTER TABLE person_competition_counts ADD PRIMARY KEY (person_id);

-- phase: rank competition counts by region and gender
CREATE TABLE person_competition_rankings AS
WITH people AS (
  SELECT counts.person_id, counts.competition_count,
    facts.person_country_id AS country_id,
    facts.person_continent_id AS continent_id,
    facts.person_gender
  FROM person_competition_counts counts
  INNER JOIN result_facts facts ON facts.person_id = counts.person_id
  GROUP BY counts.person_id, counts.competition_count,
    facts.person_country_id, facts.person_continent_id, facts.person_gender
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
), scoped AS (
  SELECT facts.*, facts.person_gender AS gender,
    COALESCE(attempts.official_solve_count, 0) AS official_solve_count
  FROM result_facts facts
  LEFT JOIN attempt_counts attempts ON attempts.result_id = facts.result_id
  WHERE facts.city_name <> ''
  UNION ALL
  SELECT facts.*, 'all' AS gender,
    COALESCE(attempts.official_solve_count, 0) AS official_solve_count
  FROM result_facts facts
  LEFT JOIN attempt_counts attempts ON attempts.result_id = facts.result_id
  WHERE facts.city_name <> ''
), aggregates AS (
  SELECT city_name, person_country_id AS country_id, event_id, gender,
    MIN(CASE WHEN best > 0 THEN best END) AS fastest_single,
    MIN(CASE WHEN average > 0 THEN average END) AS fastest_average,
    COUNT(DISTINCT person_id) AS competitor_count,
    COUNT(DISTINCT competition_id) AS competition_count,
    SUM(official_solve_count) AS official_solve_count
  FROM scoped
  GROUP BY city_name, person_country_id, event_id, gender
), winner_candidates AS (
  SELECT scoped.city_name, scoped.person_country_id AS country_id,
    scoped.event_id, scoped.gender, scoped.result_id,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.person_country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    ) AS single_choice,
    0 AS average_choice
  FROM scoped
  INNER JOIN aggregates USING (city_name, event_id, gender)
  WHERE scoped.person_country_id = aggregates.country_id
    AND scoped.best = aggregates.fastest_single
  UNION ALL
  SELECT scoped.city_name, scoped.person_country_id,
    scoped.event_id, scoped.gender, scoped.result_id,
    0,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.person_country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    )
  FROM scoped
  INNER JOIN aggregates USING (city_name, event_id, gender)
  WHERE scoped.person_country_id = aggregates.country_id
    AND scoped.average = aggregates.fastest_average
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

for (const file of [
  "sql/ranking-projections/person_year_rankings_single.sql",
  "sql/ranking-projections/person_year_rankings_average.sql",
]) {
  await replaceAll(file, "YEAR(competition_start_date)", "competition_year");
}

await replaceOnce(
  "sql/ranking-projections/person_sum_of_ranks_scores.sql",
  `FROM results result
LEFT JOIN countries country ON country.id = result.person_country_id
WHERE result.person_country_id <> ''`,
  `FROM result_facts result
WHERE result.person_country_id <> ''`,
);
await replaceAll(
  "sql/ranking-projections/person_sum_of_ranks_scores.sql",
  "COALESCE(country.continent_id, '')",
  "result.person_continent_id",
);

await replaceAll("tests/projection-release-artifact.test.mjs", "projection-transfer.sql.gz", "projection-transfer.tar.gz");
await replaceAll("tests/projection-release-artifact.test.mjs", "artifactFormatVersion: 3", "artifactFormatVersion: 4");
const artifactTest = await readFile("tests/projection-release-artifact.test.mjs", "utf8");
await writeFile(
  "tests/projection-release-artifact.test.mjs",
  artifactTest.replaceAll(
    "    tables,\n  }));",
    "    tables,\n    format: \"mariadb-tab-v1\",\n    archiveFile: \"compatibility-projection-transfer.tar.gz\",\n  }));",
  ),
);

await replaceAll("tests/release-compatibility.test.mjs", "artifactFormatVersion, 3", "artifactFormatVersion, 4");
