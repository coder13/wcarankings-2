CREATE TABLE worker_runtime_status (
  worker_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  process_id INT UNSIGNED NOT NULL,
  started_at DATETIME(6) NOT NULL,
  heartbeat_at DATETIME(6) NOT NULL,
  heartbeat_timeout_seconds SMALLINT UNSIGNED NOT NULL,
  details_json JSON NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6) ON UPDATE CURRENT_TIMESTAMP (6),
  PRIMARY KEY (worker_name)
);
