ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_world (event_id, world_sub_rank, person_id);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_continent (
  event_id,
  continent_id,
  continent_sub_rank,
  person_id
);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_country (event_id, country_id, country_sub_rank, person_id);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_person (person_id, event_id);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_gender_world_best (event_id, gender, best, person_id);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_gender_continent_best (event_id, continent_id, gender, best, person_id);

ALTER TABLE ranking_entries
ADD INDEX idx_ranking_entries_gender_country_best (event_id, country_id, gender, best, person_id);
