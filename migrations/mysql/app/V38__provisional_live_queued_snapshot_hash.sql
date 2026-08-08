ALTER TABLE provisional_live_result_sources
  ADD COLUMN IF NOT EXISTS queued_snapshot_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL
  AFTER snapshot_hash;
