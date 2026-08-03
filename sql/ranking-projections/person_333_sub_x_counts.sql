CREATE TABLE person_333_sub_x_counts AS
SELECT threshold, 'world' AS scope, '' AS region_id, COUNT(*) AS count
FROM person_333_sub_x_rankings
GROUP BY threshold
UNION ALL
SELECT threshold, 'continent' AS scope, continent_id AS region_id, COUNT(*) AS count
FROM person_333_sub_x_rankings
WHERE continent_id <> ''
GROUP BY threshold, continent_id
UNION ALL
SELECT threshold, 'country' AS scope, country_id AS region_id, COUNT(*) AS count
FROM person_333_sub_x_rankings
WHERE country_id <> ''
GROUP BY threshold, country_id;

ALTER TABLE person_333_sub_x_counts
  ADD PRIMARY KEY (threshold, scope, region_id);
