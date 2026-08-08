ALTER TABLE provisional_live_result_sources
ADD COLUMN last_imported_at DATETIME(6) NULL AFTER last_success_at;
