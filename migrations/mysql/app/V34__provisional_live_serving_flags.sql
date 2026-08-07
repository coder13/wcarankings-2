-- Live rebuilds update the current serving row in place. This flag records
-- whether the latest value came from a provisional live source.
SET
  @competition_stats_needs_flag = (
    SELECT COUNT(*) = 1
    FROM information_schema.tables AS `table`
    WHERE `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'competition_stats'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS `column`
        WHERE `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'competition_stats'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET @competition_stats_flag_sql = IF(
  @competition_stats_needs_flag,
  'ALTER TABLE competition_stats
    ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE competition_stats_flag_statement FROM @competition_stats_flag_sql;
EXECUTE competition_stats_flag_statement;
DEALLOCATE PREPARE competition_stats_flag_statement;

SET
  @competition_event_stats_needs_flag = (
    SELECT COUNT(*) = 1
    FROM information_schema.tables AS `table`
    WHERE `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'competition_event_stats'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS `column`
        WHERE `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'competition_event_stats'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET @competition_event_stats_flag_sql = IF(
  @competition_event_stats_needs_flag,
  'ALTER TABLE competition_event_stats
    ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE competition_event_stats_flag_statement
FROM @competition_event_stats_flag_sql;
EXECUTE competition_event_stats_flag_statement;
DEALLOCATE PREPARE competition_event_stats_flag_statement;

SET
  @person_event_rankings_needs_flag = (
    SELECT COUNT(*) = 1
    FROM information_schema.tables AS `table`
    WHERE `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'person_event_rankings'
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS `column`
        WHERE `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'person_event_rankings'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET @person_event_rankings_flag_sql = IF(
  @person_event_rankings_needs_flag,
  'ALTER TABLE person_event_rankings
    ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE person_event_rankings_flag_statement
FROM @person_event_rankings_flag_sql;
EXECUTE person_event_rankings_flag_statement;
DEALLOCATE PREPARE person_event_rankings_flag_statement;
