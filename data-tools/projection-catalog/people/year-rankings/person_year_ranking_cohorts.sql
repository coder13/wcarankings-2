CREATE TABLE person_year_ranking_cohorts AS
SELECT
  ROW_NUMBER() OVER (
    ORDER BY
      scope_sort,
      region_id
  ) AS cohort_id,
  scope,
  region_id
FROM
  (
    SELECT
      0 AS scope_sort,
      'world' AS scope,
      '' AS region_id
    UNION
    SELECT
      1,
      'continent',
      continent_id
    FROM
      countries
    WHERE
      continent_id <> ''
    GROUP BY
      continent_id
    UNION
    SELECT
      2,
      'country',
      id
    FROM
      countries
  ) cohorts;

ALTER TABLE person_year_ranking_cohorts
ADD PRIMARY KEY (cohort_id),
ADD UNIQUE INDEX idx_person_year_cohort_region (scope, region_id);
