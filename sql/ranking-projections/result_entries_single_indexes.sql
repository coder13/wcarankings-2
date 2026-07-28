ALTER TABLE result_entries_single ADD PRIMARY KEY (result_id);
ALTER TABLE result_entries_single ADD INDEX idx_result_entries_single_world (event_id, world_sub_rank, result_id);
ALTER TABLE result_entries_single ADD INDEX idx_result_entries_single_continent (event_id, continent_id, continent_sub_rank, result_id);
ALTER TABLE result_entries_single ADD INDEX idx_result_entries_single_country (event_id, country_id, country_sub_rank, result_id);
ALTER TABLE result_entries_single ADD INDEX idx_result_entries_single_person (person_id, event_id, world_sub_rank, result_id);
