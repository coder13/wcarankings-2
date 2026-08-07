ALTER TABLE provisional_live_result_sources
ADD COLUMN scoretaking_software VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER competition_year,
ADD COLUMN provider_status ENUM('supported', 'unsupported', 'unknown') NOT NULL DEFAULT 'unknown' AFTER scoretaking_software,
ADD COLUMN provider_message VARCHAR(255) NULL AFTER provider_status;
