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
  gender CHAR(1) NOT NULL,
  PRIMARY KEY (wca_id, sub_id)
);

CREATE TABLE formats (
  id VARCHAR(1) NOT NULL PRIMARY KEY,
  expected_solve_count INT NOT NULL
);

CREATE TABLE round_types (
  id VARCHAR(1) NOT NULL PRIMARY KEY,
  rank INT NOT NULL,
  final TINYINT NOT NULL
);

CREATE TABLE competitions (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  venue VARCHAR(255) NOT NULL DEFAULT '',
  city_name VARCHAR(100) NOT NULL,
  country_id VARCHAR(50) NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT NOT NULL,
  day TINYINT NOT NULL,
  end_year SMALLINT NOT NULL,
  end_month TINYINT NOT NULL,
  end_day TINYINT NOT NULL,
  latitude_microdegrees INT,
  longitude_microdegrees INT
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
  person_country_id VARCHAR(50) NOT NULL,
  format_id VARCHAR(1) NOT NULL,
  pos INT NOT NULL,
  round_type_id VARCHAR(10) NOT NULL,
  regional_single_record VARCHAR(100) NOT NULL,
  regional_average_record VARCHAR(100) NOT NULL
);

INSERT INTO
  countries (id, name, iso2, continent_id)
VALUES
  ('USA', 'United States', 'US', '_North America');

INSERT INTO
  persons (wca_id, sub_id, name, country_id, gender)
VALUES
  ('2026TEST01', 1, 'Visual Test Cuber', 'USA', 'm'),
  ('2026MAX01', 1, 'Max Test Cuber', 'USA', 'm');

INSERT INTO
  formats (id, expected_solve_count)
VALUES
  ('a', 5);

INSERT INTO
  round_types (id, rank, final)
VALUES
  ('f', 1, 1);

INSERT INTO
  competitions (
    id,
    name,
    city_name,
    country_id,
    year,
    month,
    day,
    end_year,
    end_month,
    end_day,
    latitude_microdegrees,
    longitude_microdegrees
  )
VALUES
  (
    'VisualSmoke2026',
    'Visual Smoke Test 2026',
    'Portland',
    'USA',
    2026,
    1,
    1,
    2026,
    1,
    2,
    45520000,
    -122681900
  );

INSERT INTO
  ranks_single (
    event_id,
    person_id,
    best,
    world_rank,
    continent_rank,
    country_rank
  )
VALUES
  ('333', '2026TEST01', 1234, 1, 1, 1),
  ('333', '2026MAX01', 2345, 2, 2, 2);

INSERT INTO
  ranks_average (
    event_id,
    person_id,
    best,
    world_rank,
    continent_rank,
    country_rank
  )
VALUES
  ('333', '2026TEST01', 1500, 1, 1, 1),
  ('333', '2026MAX01', 2600, 2, 2, 2);

INSERT INTO
  results (
    id,
    person_id,
    event_id,
    best,
    average,
    competition_id,
    person_name,
    person_country_id,
    format_id,
    pos,
    round_type_id,
    regional_single_record,
    regional_average_record
  )
VALUES
  (
    1,
    '2026TEST01',
    '333',
    1234,
    1500,
    'VisualSmoke2026',
    'Visual Test Cuber',
    'USA',
    'a',
    1,
    'f',
    '',
    ''
  ),
  (
    2,
    '2026MAX01',
    '333',
    2345,
    2600,
    'VisualSmoke2026',
    'Max Test Cuber',
    'USA',
    'a',
    2,
    'f',
    '',
    ''
  );

INSERT INTO
  export_metadata (`key`, `value`)
VALUES
  ('export_date', '2026-01-01'),
  ('fetched_at', '2026-01-01T00:00:00.000Z');
