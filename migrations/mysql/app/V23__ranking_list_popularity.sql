CREATE TABLE IF NOT EXISTS ranking_list_descriptors (
  ranking_list_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_family VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  canonical_descriptor_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  custom_list_public_id CHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL,
  first_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP (6),
  PRIMARY KEY (ranking_list_key),
  CONSTRAINT chk_ranking_list_descriptors_json CHECK (JSON_VALID(canonical_descriptor_json)),
  CONSTRAINT fk_ranking_list_descriptors_custom_list FOREIGN KEY (custom_list_public_id) REFERENCES lists (public_id) ON DELETE SET NULL,
  INDEX idx_ranking_list_descriptors_last_seen (last_seen_at)
);

CREATE TABLE IF NOT EXISTS ranking_list_daily_popularity (
  ranking_list_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  popularity_date DATE NOT NULL,
  successful_first_page_view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ranking_list_key, popularity_date),
  CONSTRAINT fk_ranking_list_daily_popularity_descriptor FOREIGN KEY (ranking_list_key) REFERENCES ranking_list_descriptors (ranking_list_key) ON DELETE CASCADE,
  INDEX idx_ranking_list_daily_popularity_date (popularity_date, ranking_list_key)
);
