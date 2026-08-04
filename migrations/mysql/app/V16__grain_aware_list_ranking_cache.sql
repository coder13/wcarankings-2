RENAME TABLE list_ranking_cache_scopes TO list_person_ranking_cache_scopes,
list_ranking_cache_entries TO list_person_ranking_cache_entries;

ALTER TABLE list_ranking_cache_versions
ADD COLUMN grain ENUM('person', 'result') NOT NULL DEFAULT 'person' AFTER target_key,
ADD COLUMN filter_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'world||all' AFTER grain,
ADD INDEX idx_list_ranking_cache_ready_stream (
  target_key,
  grain,
  filter_key,
  membership_version,
  rankings_data_version,
  status,
  activated_at
);

UPDATE list_ranking_cache_versions
SET
  filter_key = 'world||all'
WHERE
  filter_key = 'world|all';

ALTER TABLE list_ranking_rebuild_jobs
ADD COLUMN grain ENUM('person', 'result') NOT NULL DEFAULT 'person' AFTER target_key,
ADD COLUMN filter_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'world||all' AFTER grain,
DROP PRIMARY KEY,
ADD PRIMARY KEY (target_key, grain, filter_key),
ADD INDEX idx_list_ranking_rebuild_claim_stream (
  available_at,
  leased_until,
  priority,
  grain,
  filter_key
);

UPDATE list_ranking_rebuild_jobs
SET
  filter_key = 'world||all'
WHERE
  filter_key = 'world|all';

CREATE TABLE list_result_ranking_cache_scopes (
  cache_version_id BIGINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  total_count INT UNSIGNED NOT NULL,
  completed_count INT UNSIGNED NOT NULL DEFAULT 0,
  cursor_position BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_source_rank BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_list_rank BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_complete TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (cache_version_id, event_id, result_type),
  CONSTRAINT fk_list_result_cache_scopes_version FOREIGN KEY (cache_version_id) REFERENCES list_ranking_cache_versions (id) ON DELETE CASCADE
);

CREATE TABLE list_result_ranking_cache_entries (
  cache_version_id BIGINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  result_id BIGINT UNSIGNED NOT NULL,
  attempt_number TINYINT UNSIGNED NOT NULL DEFAULT 0,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  list_rank INT UNSIGNED NOT NULL,
  list_position INT UNSIGNED NOT NULL,
  score INT UNSIGNED NOT NULL,
  PRIMARY KEY (
    cache_version_id,
    event_id,
    result_type,
    result_id,
    attempt_number
  ),
  CONSTRAINT fk_list_result_cache_entries_version FOREIGN KEY (cache_version_id) REFERENCES list_ranking_cache_versions (id) ON DELETE CASCADE,
  INDEX idx_list_result_cache_page (
    cache_version_id,
    event_id,
    result_type,
    list_position
  ),
  INDEX idx_list_result_cache_person (cache_version_id, person_id)
);
