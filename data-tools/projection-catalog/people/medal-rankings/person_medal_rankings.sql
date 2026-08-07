-- phase: aggregate person medals by historical region and competition year
CREATE TABLE person_medal_scores AS
SELECT
  facts.competition_year AS year,
  facts.event_id,
  facts.person_id,
  facts.gender AS person_gender,
  facts.person_country_id AS country_id,
  facts.person_continent_id AS continent_id,
  SUM(facts.position = 1) AS gold_count,
  SUM(facts.position = 2) AS silver_count,
  SUM(facts.position = 3) AS bronze_count
FROM
  result_facts facts
WHERE
  facts.is_final_round = 1
  AND facts.position BETWEEN 1 AND 3
  AND (facts.best > 0 OR facts.average > 0)
GROUP BY
  facts.competition_year,
  facts.event_id,
  facts.person_id,
  facts.gender,
  facts.person_country_id,
  facts.person_continent_id;

ALTER TABLE person_medal_scores
ADD PRIMARY KEY (year, event_id, country_id, person_id),
ADD INDEX idx_person_medal_scores_continent (
  continent_id,
  year,
  event_id,
  person_gender,
  person_id
),
ADD INDEX idx_person_medal_scores_gender (
  person_gender,
  year,
  event_id,
  person_id
);

-- phase: build all-time medal leaderboard rows
CREATE TABLE person_medal_rankings AS
WITH
  scoped_scores AS (
    SELECT
      '' AS event_id,
      person_id,
      'world' AS scope,
      '' AS region_id,
      SUM(gold_count) AS gold_count,
      SUM(silver_count) AS silver_count,
      SUM(bronze_count) AS bronze_count
    FROM
      person_medal_scores
    GROUP BY
      person_id
    UNION ALL
    SELECT
      event_id,
      person_id,
      'world',
      '',
      SUM(gold_count),
      SUM(silver_count),
      SUM(bronze_count)
    FROM
      person_medal_scores
    GROUP BY
      event_id,
      person_id
    UNION ALL
    SELECT
      '',
      person_id,
      'continent',
      continent_id,
      SUM(gold_count),
      SUM(silver_count),
      SUM(bronze_count)
    FROM
      person_medal_scores
    WHERE
      continent_id <> ''
    GROUP BY
      person_id,
      continent_id
    UNION ALL
    SELECT
      event_id,
      person_id,
      'continent',
      continent_id,
      SUM(gold_count),
      SUM(silver_count),
      SUM(bronze_count)
    FROM
      person_medal_scores
    WHERE
      continent_id <> ''
    GROUP BY
      event_id,
      person_id,
      continent_id
    UNION ALL
    SELECT
      '',
      person_id,
      'country',
      country_id,
      SUM(gold_count),
      SUM(silver_count),
      SUM(bronze_count)
    FROM
      person_medal_scores
    WHERE
      country_id <> ''
    GROUP BY
      person_id,
      country_id
    UNION ALL
    SELECT
      event_id,
      person_id,
      'country',
      country_id,
      SUM(gold_count),
      SUM(silver_count),
      SUM(bronze_count)
    FROM
      person_medal_scores
    WHERE
      country_id <> ''
    GROUP BY
      event_id,
      person_id,
      country_id
  ),
  medal_scores AS (
    SELECT
      event_id,
      person_id,
      scope,
      region_id,
      'overall' AS medal_type,
      gold_count + silver_count + bronze_count AS medal_count
    FROM
      scoped_scores
    UNION ALL
    SELECT
      event_id,
      person_id,
      scope,
      region_id,
      'gold',
      gold_count
    FROM
      scoped_scores
    UNION ALL
    SELECT
      event_id,
      person_id,
      scope,
      region_id,
      'silver',
      silver_count
    FROM
      scoped_scores
    UNION ALL
    SELECT
      event_id,
      person_id,
      scope,
      region_id,
      'bronze',
      bronze_count
    FROM
      scoped_scores
  )
SELECT
  event_id,
  person_id,
  scope,
  region_id,
  medal_type,
  medal_count,
  RANK() OVER (
    PARTITION BY
      medal_type,
      event_id,
      scope,
      region_id
    ORDER BY
      medal_count DESC
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      medal_type,
      event_id,
      scope,
      region_id
    ORDER BY
      medal_count DESC,
      person_id
  ) AS position
FROM
  medal_scores
WHERE
  medal_count > 0;

ALTER TABLE person_medal_rankings
ADD PRIMARY KEY (event_id, medal_type, scope, region_id, person_id),
ADD INDEX idx_person_medal_rankings_page (
  event_id,
  medal_type,
  scope,
  region_id,
  position,
  person_id
);
