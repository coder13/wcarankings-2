CREATE TABLE IF NOT EXISTS ranking_counts (
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  ranking_type VARCHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  scope VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  region_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  count BIGINT NOT NULL,
  PRIMARY KEY (event_id, ranking_type, scope, region_id)
);

DELETE FROM ranking_counts;

SET
  @ranking_counts_sql = IF (
    (
      SELECT
        COUNT(*) = 2
      FROM
        information_schema.tables
      WHERE
        table_schema = DATABASE ()
        AND table_name IN (
          'ranking_entries_single',
          'ranking_entries_average'
        )
    ),
    'INSERT INTO ranking_counts (event_id, ranking_type, scope, region_id, count)
SELECT event_id, ''single'', ''world'', '''', COUNT(*)
FROM ranking_entries_single
WHERE world_rank > 0
GROUP BY event_id
UNION ALL
SELECT event_id, ''single'', ''continent'', continent_id, COUNT(*)
FROM ranking_entries_single
WHERE continent_rank > 0
GROUP BY event_id, continent_id
UNION ALL
SELECT event_id, ''single'', ''country'', country_id, COUNT(*)
FROM ranking_entries_single
WHERE country_rank > 0
GROUP BY event_id, country_id
UNION ALL
SELECT event_id, ''average'', ''world'', '''', COUNT(*)
FROM ranking_entries_average
WHERE world_rank > 0
GROUP BY event_id
UNION ALL
SELECT event_id, ''average'', ''continent'', continent_id, COUNT(*)
FROM ranking_entries_average
WHERE continent_rank > 0
GROUP BY event_id, continent_id
UNION ALL
SELECT event_id, ''average'', ''country'', country_id, COUNT(*)
FROM ranking_entries_average
WHERE country_rank > 0
GROUP BY event_id, country_id',
    'SELECT 1'
  );

PREPARE ranking_counts_backfill
FROM
  @ranking_counts_sql;

EXECUTE ranking_counts_backfill;

DEALLOCATE PREPARE ranking_counts_backfill;
