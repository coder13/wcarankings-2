SET @result_attempts_index_migration = (
  SELECT IF(
    COUNT(*) = 0,
    'SELECT 1',
    'ALTER TABLE result_attempts ADD INDEX idx_result_attempts_result (result_id, attempt_number)'
  )
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'result_attempts'
);

PREPARE result_attempts_index_statement FROM @result_attempts_index_migration;
EXECUTE result_attempts_index_statement;
DEALLOCATE PREPARE result_attempts_index_statement;
