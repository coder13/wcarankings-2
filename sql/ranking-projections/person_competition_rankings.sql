-- phase: count each person's distinct competitions
CREATE TABLE person_competition_counts AS
SELECT
  result.person_id,
  COUNT(DISTINCT result.competition_id) AS competition_count
FROM results result
INNER JOIN persons person
  ON person.wca_id = result.person_id
 AND person.sub_id = 1
GROUP BY result.person_id;

ALTER TABLE person_competition_counts
  ADD PRIMARY KEY (person_id);

-- phase: rank competition counts by region and gender
CREATE TABLE person_competition_rankings AS
WITH people AS (
  SELECT
    counts.person_id,
    counts.competition_count,
    person.country_id,
    COALESCE(country.continent_id, '') AS continent_id,
    CASE
      WHEN person.gender IN ('m', 'f') THEN person.gender
      ELSE 'o'
    END AS person_gender
  FROM person_competition_counts counts
  INNER JOIN persons person
    ON person.wca_id = counts.person_id
   AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
), cohorts AS (
  SELECT person_id, competition_count, 'world' AS scope, '' AS region_id, 'all' AS gender
  FROM people
  UNION ALL
  SELECT person_id, competition_count, 'world', '', person_gender
  FROM people
  UNION ALL
  SELECT person_id, competition_count, 'continent', continent_id, 'all'
  FROM people
  WHERE continent_id <> ''
  UNION ALL
  SELECT person_id, competition_count, 'continent', continent_id, person_gender
  FROM people
  WHERE continent_id <> ''
  UNION ALL
  SELECT person_id, competition_count, 'country', country_id, 'all'
  FROM people
  WHERE country_id <> ''
  UNION ALL
  SELECT person_id, competition_count, 'country', country_id, person_gender
  FROM people
  WHERE country_id <> ''
)
SELECT
  person_id,
  competition_count,
  scope,
  region_id,
  gender,
  RANK() OVER (
    PARTITION BY scope, region_id, gender
    ORDER BY competition_count DESC
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY scope, region_id, gender
    ORDER BY competition_count DESC, person_id
  ) AS position
FROM cohorts;

ALTER TABLE person_competition_rankings
  ADD PRIMARY KEY (scope, region_id, gender, person_id),
  ADD INDEX idx_person_competition_rankings_page (
    scope, region_id, gender, position, person_id
  );

CREATE TABLE person_competition_ranking_counts AS
SELECT scope, region_id, gender, COUNT(*) AS count
FROM person_competition_rankings
GROUP BY scope, region_id, gender;

ALTER TABLE person_competition_ranking_counts
  ADD PRIMARY KEY (scope, region_id, gender);
