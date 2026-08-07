-- Add live-overlay rows to existing person metrics tables.
-- Fresh databases create the table during the projection build.
SET
  @person_period_metrics_needs_upgrade = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'person_period_metrics'
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'person_period_metrics'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @person_period_metrics_upgrade_sql = IF (
    @person_period_metrics_needs_upgrade,
    'ALTER TABLE person_period_metrics
      DROP PRIMARY KEY,
      ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0,
      ADD PRIMARY KEY (period_year, person_id, is_provisional)',
    'SELECT 1'
  );

PREPARE person_period_metrics_upgrade_statement
FROM
  @person_period_metrics_upgrade_sql;

EXECUTE person_period_metrics_upgrade_statement;

DEALLOCATE PREPARE person_period_metrics_upgrade_statement;
