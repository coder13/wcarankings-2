-- The overlay reads active competition snapshots by event and then joins their
-- country and competition data for a bounded ranking page.
ALTER TABLE provisional_live_results
ADD INDEX idx_provisional_live_results_overlay (event_id, competition_id, projection_result_id);
