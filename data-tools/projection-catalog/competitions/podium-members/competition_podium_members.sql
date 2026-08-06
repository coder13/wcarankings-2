CREATE TABLE competition_podium_members AS
SELECT
  result.competition_id,
  result.event_id,
  'single' AS result_type,
  result.pos AS podium_position,
  result.person_id,
  result.id AS result_id,
  result.best AS result_value
FROM
  results result
  INNER JOIN round_types round_type ON round_type.id = result.round_type_id
  AND round_type.final = 1
WHERE
  result.event_id IN ('333bf', '444bf', '555bf')
  AND result.pos BETWEEN 1 AND 3
  AND result.best > 0
UNION ALL
SELECT
  result.competition_id,
  result.event_id,
  'average',
  result.pos,
  result.person_id,
  result.id,
  result.average
FROM
  results result
  INNER JOIN round_types round_type ON round_type.id = result.round_type_id
  AND round_type.final = 1
WHERE
  result.event_id NOT IN ('333bf', '444bf', '555bf', '333mbf')
  AND result.pos BETWEEN 1 AND 3
  AND result.average > 0;

ALTER TABLE competition_podium_members
ADD PRIMARY KEY (
  competition_id,
  event_id,
  result_type,
  podium_position,
  result_id
),
ADD INDEX idx_comp_podium_members_person (person_id, event_id, result_type, competition_id);
