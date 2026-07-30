-- Regression fixture for a competitor who changed country.
CREATE TEMPORARY TABLE regional_ranking_history_fixture (
  event_id VARCHAR(10) NOT NULL,
  person_id VARCHAR(10) NOT NULL,
  person_country_id VARCHAR(50) NOT NULL,
  continent_id VARCHAR(50) NOT NULL,
  best INT NOT NULL,
  average INT NOT NULL,
  regional_single_record VARCHAR(3) NOT NULL,
  regional_average_record VARCHAR(3) NOT NULL
);

INSERT INTO regional_ranking_history_fixture
  (event_id, person_id, person_country_id, continent_id, best, average, regional_single_record, regional_average_record)
VALUES
  ('333', 'CHANGE1', 'United States', '_North America', 549, 600, '', ''),
  ('333', 'CHANGE1', 'New Zealand', '_Oceania', 600, 650, '', '');

-- The current persons.country_id for CHANGE1 is New Zealand. Normal country
-- rankings must still expose 5.49 for the United States and 6.00 for NZ.
