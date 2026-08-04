CREATE TABLE IF NOT EXISTS list_ranking_cache_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  list_id BIGINT UNSIGNED NOT NULL,
  membership_version BIGINT UNSIGNED NOT NULL,
  rankings_data_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  build_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('building', 'ready', 'failed', 'stale') NOT NULL DEFAULT 'building',
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  completed_at DATETIME(6) NULL,
  activated_at DATETIME(6) NULL,
  error_message VARCHAR(1000) NULL,
  CONSTRAINT fk_list_ranking_cache_versions_list FOREIGN KEY (list_id) REFERENCES lists (id) ON DELETE CASCADE,
  UNIQUE KEY uq_list_ranking_cache_build (
    list_id,
    membership_version,
    rankings_data_version,
    build_token
  ),
  INDEX idx_list_ranking_cache_ready (
    list_id,
    membership_version,
    rankings_data_version,
    status,
    activated_at
  )
);

CREATE TABLE IF NOT EXISTS list_ranking_cache_scopes (
  cache_version_id BIGINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  total_count INT UNSIGNED NOT NULL,
  PRIMARY KEY (cache_version_id, event_id, result_type),
  CONSTRAINT fk_list_ranking_cache_scopes_version FOREIGN KEY (cache_version_id) REFERENCES list_ranking_cache_versions (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS list_ranking_cache_entries (
  cache_version_id BIGINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  list_rank INT UNSIGNED NOT NULL,
  list_position INT UNSIGNED NOT NULL,
  score INT UNSIGNED NOT NULL,
  PRIMARY KEY (
    cache_version_id,
    event_id,
    result_type,
    person_id
  ),
  CONSTRAINT fk_list_ranking_cache_entries_version FOREIGN KEY (cache_version_id) REFERENCES list_ranking_cache_versions (id) ON DELETE CASCADE,
  INDEX idx_list_ranking_cache_page (
    cache_version_id,
    event_id,
    result_type,
    list_position
  ),
  INDEX idx_list_ranking_cache_person (cache_version_id, person_id)
);

CREATE TABLE IF NOT EXISTS list_ranking_rebuild_jobs (
  list_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  membership_version BIGINT UNSIGNED NOT NULL,
  rankings_data_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 1,
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  leased_until DATETIME(6) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6) ON UPDATE CURRENT_TIMESTAMP (6),
  CONSTRAINT fk_list_ranking_rebuild_jobs_list FOREIGN KEY (list_id) REFERENCES lists (id) ON DELETE CASCADE,
  INDEX idx_list_ranking_rebuild_claim (available_at, leased_until, priority)
);
