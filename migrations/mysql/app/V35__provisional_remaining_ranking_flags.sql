-- Live workers replace the current serving row in place. These flags identify
-- projections whose current value includes live, non-export results.
SET
  @ranking_table = 'result_rankings_single';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'person_competition_rankings';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'person_sum_of_ranks_scores';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

-- Older generated Average-ranking tables predate the gender column now
-- produced by the result-ranking projection. Live event refreshes require the
-- same row shape for Single and Average values.
SET
  @average_ranking_needs_gender = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = 'result_rankings_average'
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = 'result_rankings_average'
          AND `column`.column_name = 'gender'
      )
  );

SET
  @average_ranking_gender_sql = IF (
    @average_ranking_needs_gender,
    'ALTER TABLE result_rankings_average ADD COLUMN gender ENUM(\'m\', \'f\', \'o\') NOT NULL DEFAULT \'o\' AFTER person_id',
    'SELECT 1'
  );

PREPARE average_ranking_gender_statement
FROM
  @average_ranking_gender_sql;

EXECUTE average_ranking_gender_statement;

DEALLOCATE PREPARE average_ranking_gender_statement;

CREATE TABLE IF NOT EXISTS provisional_live_result_round_hashes (
  source_name ENUM('wca-live', 'cubing-china') NOT NULL,
  competition_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  round_number TINYINT UNSIGNED NOT NULL,
  snapshot_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (
    source_name,
    competition_id,
    event_id,
    round_number
  ),
  CONSTRAINT fk_provisional_live_result_round_hash_source FOREIGN KEY (source_name, competition_id) REFERENCES provisional_live_result_sources (source_name, competition_id) ON DELETE CASCADE
);

SET
  @ranking_table = 'result_rankings_average';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'person_activity_rankings';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'person_medal_scores';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'person_medal_rankings';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;

SET
  @ranking_table = 'city_event_stats';

SET
  @ranking_needs_flag = (
    SELECT
      COUNT(*) = 1
    FROM
      information_schema.tables AS `table`
    WHERE
      `table`.table_schema = DATABASE ()
      AND `table`.table_name = @ranking_table
      AND NOT EXISTS (
        SELECT
          1
        FROM
          information_schema.columns AS `column`
        WHERE
          `column`.table_schema = DATABASE ()
          AND `column`.table_name = @ranking_table
          AND `column`.column_name = 'is_provisional'
      )
  );

SET
  @ranking_flag_sql = IF (
    @ranking_needs_flag,
    CONCAT(
      'ALTER TABLE ',
      @ranking_table,
      ' ADD COLUMN is_provisional TINYINT(1) NOT NULL DEFAULT 0'
    ),
    'SELECT 1'
  );

PREPARE ranking_flag_statement
FROM
  @ranking_flag_sql;

EXECUTE ranking_flag_statement;

DEALLOCATE PREPARE ranking_flag_statement;
