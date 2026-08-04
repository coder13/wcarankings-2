ALTER TABLE ranking_entries ADD INDEX idx_ranking_entries_world (event_id, world_sub_rank, person_id);
ALTER TABLE ranking_entries ADD INDEX idx_ranking_entries_continent (event_id, continent_id, continent_sub_rank, person_id);
ALTER TABLE ranking_entries ADD INDEX idx_ranking_entries_country (event_id, country_id, country_sub_rank, person_id);
ALTER TABLE ranking_entries ADD INDEX idx_ranking_entries_person (person_id, event_id);
