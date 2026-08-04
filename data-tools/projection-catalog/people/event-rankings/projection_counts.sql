CREATE TABLE person_ranking_counts AS
SELECT event_id, result_type, 'world' AS scope, '' AS region_id, COUNT(*) AS count
FROM person_event_rankings GROUP BY event_id, result_type
UNION ALL
SELECT event_id, result_type, 'continent', continent_id, COUNT(*)
FROM person_event_rankings WHERE continent_id <> ''
GROUP BY event_id, result_type, continent_id
UNION ALL
SELECT event_id, result_type, 'country', country_id, COUNT(*)
FROM person_event_rankings WHERE country_id <> ''
GROUP BY event_id, result_type, country_id;
ALTER TABLE person_ranking_counts ADD PRIMARY KEY (event_id, result_type, scope, region_id);
