ALTER TABLE import_runs
  ADD COLUMN projection_build_started_at DATETIME(6) NULL AFTER fetched_at,
  ADD COLUMN projection_built_at DATETIME(6) NULL AFTER projection_build_started_at,
  ADD COLUMN projection_build_duration_ms BIGINT UNSIGNED NULL AFTER projection_built_at;
