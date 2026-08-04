ALTER TABLE result_entries_single
ADD PRIMARY KEY (result_id),
ADD INDEX idx_result_entries_single_event (event_id),
ADD INDEX idx_result_entries_single_continent (event_id, continent_id),
ADD INDEX idx_result_entries_single_country (event_id, country_id);
