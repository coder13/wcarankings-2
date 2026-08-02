-- phase: count each person's distinct competitions
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
