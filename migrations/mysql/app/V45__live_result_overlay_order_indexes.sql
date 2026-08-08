-- The live result overlay finds the first official result at or after a live
-- result. These indexes make that lookup a short ordered range scan.
ALTER TABLE result_rankings_single
ADD INDEX idx_result_rankings_single_live_order (
  period_year,
  event_id,
  result_value,
  competition_start_date,
  competition_id,
  result_id,
  attempt_number
);

ALTER TABLE result_rankings_average
ADD INDEX idx_result_rankings_average_live_order (period_year, event_id, result_value, result_id);
