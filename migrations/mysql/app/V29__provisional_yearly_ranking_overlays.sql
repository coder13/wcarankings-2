-- Add the live-overlay source flag to the existing yearly ranking tables.
-- Fresh databases create these tables during the projection build, so this
-- migration does nothing until a generated table exists.
SET
  @single_needs_upgrade = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'person_year_rankings_single'
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'person_year_rankings_single'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @single_upgrade_sql = IF (
    @single_needs_upgrade,
    'ALTER TABLE person_year_rankings_single
    ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  );

PREPARE single_upgrade_statement
FROM
  @single_upgrade_sql;

EXECUTE single_upgrade_statement;

DEALLOCATE PREPARE single_upgrade_statement;

SET
  @average_needs_upgrade = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'person_year_rankings_average'
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'person_year_rankings_average'
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @average_upgrade_sql = IF (
    @average_needs_upgrade,
    'ALTER TABLE person_year_rankings_average
    ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
  );

PREPARE average_upgrade_statement
FROM
  @average_upgrade_sql;

EXECUTE average_upgrade_statement;

DEALLOCATE PREPARE average_upgrade_statement;
