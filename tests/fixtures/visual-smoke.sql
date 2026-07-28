CREATE TABLE countries (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  iso2 CHAR(2) NOT NULL,
  continent_id VARCHAR(50) NOT NULL
);

CREATE TABLE persons (
  wca_id VARCHAR(20) NOT NULL,
  sub_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  country_id VARCHAR(50) NOT NULL,
  PRIMARY KEY (wca_id, sub_id)
);

CREATE TABLE competitions (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT NOT NULL,
  day TINYINT NOT NULL
);

CREATE TABLE ranks_single (
  event_id VARCHAR(20) NOT NULL,
  person_id VARCHAR(20) NOT NULL,
  best INT NOT NULL,
  world_rank INT NOT NULL,
  continent_rank INT NOT NULL,
  country_rank INT NOT NULL
);

CREATE TABLE ranks_average (
  event_id VARCHAR(20) NOT NULL,
  person_id VARCHAR(20) NOT NULL,
  best INT NOT NULL,
  world_rank INT NOT NULL,
  continent_rank INT NOT NULL,
  country_rank INT NOT NULL
);

CREATE TABLE results (
  id INT NOT NULL PRIMARY KEY,
  person_id VARCHAR(20) NOT NULL,
  event_id VARCHAR(20) NOT NULL,
  best INT NOT NULL,
  average INT NOT NULL,
  competition_id VARCHAR(50) NOT NULL,
  person_name VARCHAR(100) NOT NULL,
  round_type_id VARCHAR(10) NOT NULL,
  regional_single_record VARCHAR(100) NOT NULL
);

INSERT INTO countries (id, name, iso2, continent_id)
VALUES ('USA', 'United States', 'US', '_North America');

INSERT INTO persons (wca_id, sub_id, name, country_id)
VALUES ('2026TEST01', 1, 'Visual Test Cuber', 'USA');

INSERT INTO competitions (id, name, year, month, day)
VALUES ('VisualSmoke2026', 'Visual Smoke Test 2026', 2026, 1, 1);

INSERT INTO ranks_single (event_id, person_id, best, world_rank, continent_rank, country_rank)
VALUES ('333', '2026TEST01', 1234, 1, 1, 1);

INSERT INTO ranks_average (event_id, person_id, best, world_rank, continent_rank, country_rank)
VALUES ('333', '2026TEST01', 1500, 1, 1, 1);

INSERT INTO results (id, person_id, event_id, best, average, competition_id, person_name, round_type_id, regional_single_record)
VALUES (1, '2026TEST01', '333', 1234, 1500, 'VisualSmoke2026', 'Visual Test Cuber', 'f', '');

INSERT INTO export_metadata (`key`, `value`) VALUES
  ('export_date', '2026-01-01'),
  ('fetched_at', '2026-01-01T00:00:00.000Z');
