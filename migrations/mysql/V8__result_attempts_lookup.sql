ALTER TABLE result_attempts
  ADD INDEX idx_result_attempts_result (result_id, attempt_number);
