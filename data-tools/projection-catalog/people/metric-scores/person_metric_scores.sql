CREATE TABLE person_metric_scores AS
WITH totals AS (
  SELECT
    metric_version, event_set_version, result_type,
    scope, region_id, person_id,
    SUM(sum_of_ranks_value) AS sum_of_ranks_score,
    SUM(kinch_value) AS kinch_score,
    COUNT(*) AS sum_of_ranks_coverage,
    COUNT(kinch_value) AS kinch_coverage
  FROM person_metric_values
  GROUP BY
    metric_version, event_set_version, result_type,
    scope, region_id, person_id
), scores_by_metric AS (
  SELECT
    'sum_of_ranks' AS metric,
    metric_version, event_set_version, result_type,
    scope, region_id, person_id,
    sum_of_ranks_score AS score,
    sum_of_ranks_coverage AS coverage,
    CASE WHEN result_type = 'single' THEN 17 ELSE 16 END AS required_coverage
  FROM totals
  UNION ALL
  SELECT
    'kinch', metric_version, event_set_version, result_type,
    scope, region_id, person_id,
    kinch_score, kinch_coverage, 16
  FROM totals
), eligible AS (
  SELECT * FROM scores_by_metric WHERE coverage = required_coverage
)
SELECT
  metric, metric_version, event_set_version, result_type,
  scope, region_id, person_id, score, coverage, required_coverage,
  DENSE_RANK() OVER (
    PARTITION BY metric, metric_version, event_set_version, result_type, scope, region_id
    ORDER BY CASE WHEN metric = 'kinch' THEN -score ELSE score END
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY metric, metric_version, event_set_version, result_type, scope, region_id
    ORDER BY CASE WHEN metric = 'kinch' THEN -score ELSE score END, person_id
  ) AS position
FROM eligible;

ALTER TABLE person_metric_scores
  ADD PRIMARY KEY (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id
  ),
  ADD INDEX idx_person_metric_scores_page (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, position, person_id
  );

CREATE TABLE person_metric_counts AS
SELECT
  metric, metric_version, event_set_version, result_type,
  scope, region_id, COUNT(*) AS count
FROM person_metric_scores
GROUP BY metric, metric_version, event_set_version, result_type, scope, region_id;
ALTER TABLE person_metric_counts
  ADD PRIMARY KEY (
    metric, metric_version, event_set_version, result_type, scope, region_id
  );
