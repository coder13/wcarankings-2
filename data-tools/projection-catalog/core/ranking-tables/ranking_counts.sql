CREATE TABLE ranking_counts AS
SELECT
  event_id,
  'single' AS ranking_type,
  'world' AS scope,
  '' AS region_id,
  COUNT(*) AS count
FROM ranking_entries_single
WHERE world_rank > 0
GROUP BY event_id
UNION ALL
SELECT
  event_id,
  'single',
  'continent',
  continent_id,
  COUNT(*)
FROM ranking_entries_single
WHERE continent_rank > 0
GROUP BY event_id, continent_id
UNION ALL
SELECT
  event_id,
  'single',
  'country',
  country_id,
  COUNT(*)
FROM ranking_entries_single
WHERE country_rank > 0
GROUP BY event_id, country_id
UNION ALL
SELECT
  event_id,
  'average',
  'world',
  '',
  COUNT(*)
FROM ranking_entries_average
WHERE world_rank > 0
GROUP BY event_id
UNION ALL
SELECT
  event_id,
  'average',
  'continent',
  continent_id,
  COUNT(*)
FROM ranking_entries_average
WHERE continent_rank > 0
GROUP BY event_id, continent_id
UNION ALL
SELECT
  event_id,
  'average',
  'country',
  country_id,
  COUNT(*)
FROM ranking_entries_average
WHERE country_rank > 0
GROUP BY event_id, country_id;

ALTER TABLE ranking_counts
ADD PRIMARY KEY (event_id, ranking_type, scope, region_id);
