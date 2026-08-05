CREATE TABLE result_ranking_counts AS
SELECT
  event_id,
  'single' AS result_type,
  'world' AS scope,
  '' AS region_id,
  COUNT(*) AS count
FROM
  result_rankings_single
GROUP BY
  event_id
UNION ALL
SELECT
  event_id,
  'single',
  'continent',
  continent_id,
  COUNT(*)
FROM
  result_rankings_single
WHERE
  continent_id <> ''
GROUP BY
  event_id,
  continent_id
UNION ALL
SELECT
  event_id,
  'single',
  'country',
  country_id,
  COUNT(*)
FROM
  result_rankings_single
WHERE
  country_id <> ''
GROUP BY
  event_id,
  country_id
UNION ALL
SELECT
  event_id,
  'average',
  'world',
  '',
  COUNT(*)
FROM
  result_rankings_average
GROUP BY
  event_id
UNION ALL
SELECT
  event_id,
  'average',
  'continent',
  continent_id,
  COUNT(*)
FROM
  result_rankings_average
WHERE
  continent_id <> ''
GROUP BY
  event_id,
  continent_id
UNION ALL
SELECT
  event_id,
  'average',
  'country',
  country_id,
  COUNT(*)
FROM
  result_rankings_average
WHERE
  country_id <> ''
GROUP BY
  event_id,
  country_id;

ALTER TABLE result_ranking_counts
ADD PRIMARY KEY (event_id, result_type, scope, region_id);
