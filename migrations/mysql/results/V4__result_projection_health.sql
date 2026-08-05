ALTER TABLE import_runs
ADD COLUMN published_result_count BIGINT UNSIGNED NULL AFTER published_ranking_count,
ADD COLUMN result_aggregate_count BIGINT UNSIGNED NULL AFTER aggregate_count;
