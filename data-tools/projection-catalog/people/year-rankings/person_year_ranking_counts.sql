CREATE TABLE person_year_ranking_counts AS
SELECT year, event_id, 'single' AS ranking_type, cohort_id, COUNT(*) AS count
FROM person_year_rankings_single
GROUP BY year, event_id, cohort_id
UNION ALL
SELECT year, event_id, 'average' AS ranking_type, cohort_id, COUNT(*) AS count
FROM person_year_rankings_average
GROUP BY year, event_id, cohort_id;

ALTER TABLE person_year_ranking_counts
  ADD PRIMARY KEY (year, event_id, ranking_type, cohort_id);
