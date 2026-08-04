CREATE TABLE result_gender_ranking_counts AS
SELECT event_id, 'single' AS result_type, gender_set, 'world' AS scope, '' AS region_id, COUNT(*) AS count
FROM result_gender_rankings_single
GROUP BY event_id, gender_set
UNION ALL
SELECT event_id, 'single', gender_set, 'continent', continent_id, COUNT(*)
FROM result_gender_rankings_single
WHERE continent_id <> ''
GROUP BY event_id, gender_set, continent_id
UNION ALL
SELECT event_id, 'single', gender_set, 'country', country_id, COUNT(*)
FROM result_gender_rankings_single
WHERE country_id <> ''
GROUP BY event_id, gender_set, country_id
UNION ALL
SELECT event_id, 'average', gender_set, 'world', '', COUNT(*)
FROM result_gender_rankings_average
GROUP BY event_id, gender_set
UNION ALL
SELECT event_id, 'average', gender_set, 'continent', continent_id, COUNT(*)
FROM result_gender_rankings_average
WHERE continent_id <> ''
GROUP BY event_id, gender_set, continent_id
UNION ALL
SELECT event_id, 'average', gender_set, 'country', country_id, COUNT(*)
FROM result_gender_rankings_average
WHERE country_id <> ''
GROUP BY event_id, gender_set, country_id;

ALTER TABLE result_gender_ranking_counts
  ADD PRIMARY KEY (event_id, result_type, gender_set, scope, region_id);
