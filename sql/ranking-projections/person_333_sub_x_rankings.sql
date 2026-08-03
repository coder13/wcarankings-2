-- 3x3 Sub-X rankings
-- Grain: threshold + person. Counts official 3x3 round single results whose
-- best value is below the selected threshold. The public WCA export v2 does
-- not include per-attempt values, so this projection counts available official
-- single results rather than hidden solve attempts.

CREATE TABLE person_333_sub_x_rankings AS
WITH thresholds AS (
  SELECT 500 AS threshold
  UNION ALL SELECT 600
  UNION ALL SELECT 700
  UNION ALL SELECT 800
  UNION ALL SELECT 900
  UNION ALL SELECT 1000
  UNION ALL SELECT 1100
  UNION ALL SELECT 1200
  UNION ALL SELECT 1500
  UNION ALL SELECT 2000
),
person_counts AS (
  SELECT
    thresholds.threshold,
    facts.person_id,
    COALESCE(person.country_id, '') AS country_id,
    COALESCE(country.continent_id, '') AS continent_id,
    COUNT(*) AS result_count
  FROM thresholds
  JOIN result_facts facts
    ON facts.event_id = '333'
   AND facts.best > 0
   AND facts.best < thresholds.threshold
  LEFT JOIN persons person
    ON person.wca_id = facts.person_id
   AND person.sub_id = 1
  LEFT JOIN countries country
    ON country.id = person.country_id
  GROUP BY
    thresholds.threshold,
    facts.person_id,
    COALESCE(person.country_id, ''),
    COALESCE(country.continent_id, '')
)
SELECT
  threshold,
  person_id,
  country_id,
  continent_id,
  result_count,
  DENSE_RANK() OVER (
    PARTITION BY threshold
    ORDER BY result_count DESC
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY threshold
    ORDER BY result_count DESC, person_id
  ) AS world_position,
  DENSE_RANK() OVER (
    PARTITION BY threshold, continent_id
    ORDER BY result_count DESC
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY threshold, continent_id
    ORDER BY result_count DESC, person_id
  ) AS continent_position,
  DENSE_RANK() OVER (
    PARTITION BY threshold, country_id
    ORDER BY result_count DESC
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY threshold, country_id
    ORDER BY result_count DESC, person_id
  ) AS country_position
FROM person_counts;

ALTER TABLE person_333_sub_x_rankings
  ADD PRIMARY KEY (threshold, person_id),
  ADD INDEX idx_person_333_sub_x_world (threshold, world_position, person_id),
  ADD INDEX idx_person_333_sub_x_continent (threshold, continent_id, continent_position, person_id),
  ADD INDEX idx_person_333_sub_x_country (threshold, country_id, country_position, person_id),
  ADD INDEX idx_person_333_sub_x_person (person_id, threshold);
