CREATE TABLE provisional_live_result_sources (
  source_name ENUM('wca-live', 'cubing-china') NOT NULL,
  competition_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  remote_competition_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  competition_year SMALLINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  poll_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  next_poll_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  snapshot_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  leased_until DATETIME(6) NULL,
  last_success_at DATETIME(6) NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (source_name, competition_id),
  INDEX idx_provisional_live_source_claim (enabled, next_poll_at, leased_until)
);

CREATE TABLE provisional_live_results (
  source_name ENUM('wca-live', 'cubing-china') NOT NULL,
  competition_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_result_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  round_number TINYINT UNSIGNED NOT NULL,
  format_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  person_name VARCHAR(120) CHARACTER SET utf8mb4 NOT NULL,
  country_iso2 CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL,
  best INT NOT NULL,
  average INT NOT NULL,
  attempts_json JSON NOT NULL,
  observed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (source_name, competition_id, source_result_id),
  INDEX idx_provisional_live_results_event (competition_id, event_id, person_id),
  CONSTRAINT fk_provisional_live_result_source FOREIGN KEY (source_name, competition_id)
    REFERENCES provisional_live_result_sources (source_name, competition_id) ON DELETE CASCADE
);

CREATE TABLE provisional_current_year_ranking_rebuild_jobs (
  competition_year SMALLINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  priority TINYINT UNSIGNED NOT NULL DEFAULT 5,
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  leased_until DATETIME(6) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (competition_year, event_id),
  INDEX idx_provisional_current_year_claim (available_at, leased_until, priority)
);

CREATE TABLE provisional_current_year_rankings (
  year SMALLINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  scope ENUM('world', 'continent', 'country') NOT NULL,
  region_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_source ENUM('official', 'live') NOT NULL,
  result_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  result_value INT NOT NULL,
  public_rank INT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  PRIMARY KEY (year, event_id, result_type, scope, region_id, person_id),
  INDEX idx_provisional_current_year_browse (year, event_id, result_type, scope, region_id, position, person_id)
);
