CREATE TABLE IF NOT EXISTS list_ranking_cache_targets (
  target_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  list_id BIGINT UNSIGNED NULL,
  target_kind ENUM('saved', 'dynamic') NOT NULL,
  membership_version BIGINT UNSIGNED NOT NULL,
  member_count INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6) ON UPDATE CURRENT_TIMESTAMP (6),
  CONSTRAINT fk_list_ranking_cache_targets_list FOREIGN KEY (list_id) REFERENCES lists (id) ON DELETE CASCADE,
  UNIQUE KEY uq_list_ranking_cache_targets_list (list_id)
);

CREATE TABLE IF NOT EXISTS list_ranking_cache_target_members (
  target_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (target_key, person_id),
  CONSTRAINT fk_list_ranking_cache_target_members_target FOREIGN KEY (target_key) REFERENCES list_ranking_cache_targets (target_key) ON DELETE CASCADE,
  INDEX idx_list_ranking_cache_target_members_person (person_id)
);

CREATE TABLE IF NOT EXISTS list_ranking_cache_version_members (
  cache_version_id BIGINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (cache_version_id, person_id),
  CONSTRAINT fk_list_ranking_cache_version_members_version FOREIGN KEY (cache_version_id) REFERENCES list_ranking_cache_versions (id) ON DELETE CASCADE,
  INDEX idx_list_ranking_cache_version_members_person (person_id)
);

ALTER TABLE list_ranking_cache_versions
MODIFY list_id BIGINT UNSIGNED NULL,
ADD COLUMN target_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '' AFTER list_id,
ADD INDEX idx_list_ranking_cache_ready_target (
  target_key,
  membership_version,
  rankings_data_version,
  status,
  activated_at
);

INSERT INTO
  list_ranking_cache_targets (
    target_key,
    list_id,
    target_kind,
    membership_version,
    member_count
  )
SELECT
  CONCAT('list:', id),
  id,
  'saved',
  membership_version,
  member_count
FROM
  lists
WHERE
  deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  membership_version = VALUES(membership_version),
  member_count = VALUES(member_count);

INSERT IGNORE INTO
  list_ranking_cache_target_members (target_key, person_id)
SELECT
  CONCAT('list:', member.list_id),
  member.person_id
FROM
  list_members member
  JOIN lists list ON list.id = member.list_id
  AND list.deleted_at IS NULL;

UPDATE list_ranking_cache_versions
SET
  target_key = CONCAT('list:', list_id)
WHERE
  target_key = ''
  AND list_id IS NOT NULL;

ALTER TABLE list_ranking_cache_versions
ADD CONSTRAINT fk_list_ranking_cache_versions_target FOREIGN KEY (target_key) REFERENCES list_ranking_cache_targets (target_key) ON DELETE CASCADE;

ALTER TABLE list_ranking_cache_scopes
ADD COLUMN completed_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_count,
ADD COLUMN cursor_position BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER completed_count,
ADD COLUMN last_source_rank BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER cursor_position,
ADD COLUMN last_list_rank BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_source_rank,
ADD COLUMN is_complete TINYINT(1) NOT NULL DEFAULT 0 AFTER last_list_rank;

ALTER TABLE list_ranking_cache_entries
ADD COLUMN result_id BIGINT UNSIGNED NULL AFTER result_type;

SET
  @person_ranking_backfill_sql = IF (
    EXISTS (
      SELECT
        1
      FROM
        information_schema.tables
      WHERE
        table_schema = DATABASE ()
        AND table_name = 'person_event_rankings'
    ),
    'UPDATE list_ranking_cache_entries entry
   JOIN person_event_rankings ranking
     ON ranking.event_id = CONVERT(entry.event_id USING utf8mb4)
    AND ranking.result_type = CONVERT(entry.result_type USING utf8mb4)
    AND ranking.person_id = CONVERT(entry.person_id USING utf8mb4)
   SET entry.result_id = ranking.result_id
   WHERE entry.result_id IS NULL',
    'SELECT 1'
  );

PREPARE person_ranking_backfill
FROM
  @person_ranking_backfill_sql;

EXECUTE person_ranking_backfill;

DEALLOCATE PREPARE person_ranking_backfill;

ALTER TABLE list_ranking_rebuild_jobs
ADD COLUMN target_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '' AFTER list_id;

UPDATE list_ranking_rebuild_jobs
SET
  target_key = CONCAT('list:', list_id)
WHERE
  target_key = ''
  AND list_id IS NOT NULL;

ALTER TABLE list_ranking_rebuild_jobs
MODIFY list_id BIGINT UNSIGNED NULL,
DROP PRIMARY KEY,
ADD PRIMARY KEY (target_key),
ADD INDEX idx_list_ranking_rebuild_jobs_list (list_id);
