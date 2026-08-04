CREATE TABLE person_metric_values AS
WITH scoped AS (
  SELECT result_type, 'world' AS scope, '' AS region_id, person_id, event_id,
    world_rank AS event_rank, result_value AS personal_result
  FROM person_event_rankings
  WHERE event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf')
  UNION ALL
  SELECT result_type, 'continent', continent_id, person_id, event_id,
    continent_rank, result_value
  FROM person_event_rankings
  WHERE continent_id <> ''
    AND event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf')
  UNION ALL
  SELECT result_type, 'country', country_id, person_id, event_id,
    country_rank, result_value
  FROM person_event_rankings
  WHERE country_id <> ''
    AND event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf')
)
SELECT
  1 AS metric_version,
  1 AS event_set_version,
  result_type, scope, region_id, person_id, event_id, event_rank,
  personal_result,
  MIN(personal_result) OVER (
    PARTITION BY result_type, scope, region_id, event_id
  ) AS reference_result,
  CAST(event_rank AS DECIMAL(18, 6)) AS sum_of_ranks_value,
  CASE
    WHEN event_id = '333mbf' THEN NULL
    ELSE CAST(
      100.0 * MIN(personal_result) OVER (
        PARTITION BY result_type, scope, region_id, event_id
      ) / personal_result
      AS DECIMAL(18, 6)
    )
  END AS kinch_value
FROM scoped;

ALTER TABLE person_metric_values
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, person_id, event_id
  );
