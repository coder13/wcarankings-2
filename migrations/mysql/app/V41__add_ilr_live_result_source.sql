ALTER TABLE provisional_live_results
DROP FOREIGN KEY IF EXISTS fk_provisional_live_result_source;

ALTER TABLE provisional_live_result_round_hashes
DROP FOREIGN KEY IF EXISTS fk_provisional_live_result_round_hash_source;

ALTER TABLE provisional_live_result_sources
MODIFY source_name ENUM('unknown', 'ilr', 'wca-live', 'cubing-china') NOT NULL;

ALTER TABLE provisional_live_results
MODIFY source_name ENUM('unknown', 'ilr', 'wca-live', 'cubing-china') NOT NULL;

ALTER TABLE provisional_live_result_round_hashes
MODIFY source_name ENUM('unknown', 'ilr', 'wca-live', 'cubing-china') NOT NULL;

ALTER TABLE provisional_live_results
ADD CONSTRAINT fk_provisional_live_result_source FOREIGN KEY (source_name, competition_id) REFERENCES provisional_live_result_sources (source_name, competition_id) ON DELETE CASCADE;

ALTER TABLE provisional_live_result_round_hashes
ADD CONSTRAINT fk_provisional_live_result_round_hash_source FOREIGN KEY (source_name, competition_id) REFERENCES provisional_live_result_sources (source_name, competition_id) ON DELETE CASCADE;
