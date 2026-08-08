ALTER TABLE countries
ADD INDEX idx_countries_iso2 (iso2);

ALTER TABLE provisional_live_results
ADD INDEX idx_provisional_live_results_event_competition (event_id, competition_id);
