CREATE TABLE result_counts AS
SELECT event_id, 'world' AS scope, '' AS region_id, COUNT(*) AS count
FROM result_entries_single
GROUP BY event_id
UNION ALL
SELECT event_id, 'continent' AS scope, continent_id AS region_id, COUNT(*) AS count
FROM result_entries_single
WHERE continent_id <> ''
GROUP BY event_id, continent_id
UNION ALL
SELECT event_id, 'country' AS scope, country_id AS region_id, COUNT(*) AS count
FROM result_entries_single
WHERE country_id <> ''
GROUP BY event_id, country_id;

ALTER TABLE result_counts ADD PRIMARY KEY (event_id, scope, region_id);
