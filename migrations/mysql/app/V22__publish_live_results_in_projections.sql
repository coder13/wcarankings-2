ALTER TABLE provisional_live_results
  ADD COLUMN projection_result_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE AFTER source_result_id,
  ADD COLUMN round_type_id VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '1' AFTER round_number,
  ADD COLUMN position INT NOT NULL DEFAULT 0 AFTER average;

CREATE TABLE provisional_projection_rebuild_jobs (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  source_version BIGINT UNSIGNED NOT NULL,
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  leased_until DATETIME(6) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(1000) NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE provisional_live_result_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  source_version BIGINT UNSIGNED NOT NULL DEFAULT 0
);

INSERT INTO provisional_live_result_state (id) VALUES (1);
