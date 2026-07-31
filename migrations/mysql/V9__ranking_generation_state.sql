CREATE TABLE IF NOT EXISTS ranking_generation_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  generation_id VARCHAR(160) NOT NULL,
  export_id VARCHAR(64) NOT NULL,
  artifact_format_version INT UNSIGNED NOT NULL,
  dataset_schema_version INT UNSIGNED NOT NULL,
  fingerprints_json LONGTEXT NOT NULL,
  source_sha CHAR(40) NOT NULL,
  artifact_run_id BIGINT UNSIGNED NOT NULL,
  artifact_id BIGINT UNSIGNED NOT NULL,
  activation_tables_json LONGTEXT NOT NULL,
  previous_tables_json LONGTEXT NOT NULL,
  activated_at DATETIME(6) NOT NULL,
  CONSTRAINT chk_ranking_generation_singleton CHECK (id = 1),
  CONSTRAINT chk_ranking_generation_fingerprints_json CHECK (JSON_VALID(fingerprints_json)),
  CONSTRAINT chk_ranking_generation_activation_tables_json CHECK (JSON_VALID(activation_tables_json)),
  CONSTRAINT chk_ranking_generation_previous_tables_json CHECK (JSON_VALID(previous_tables_json))
);
