ALTER TABLE provisional_live_result_sources
ADD COLUMN IF NOT EXISTS registered_person_count INT UNSIGNED NULL AFTER provider_message;
