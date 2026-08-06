CREATE TABLE competition_stats AS
WITH
  competitor_counts AS (
    SELECT
      competition_id,
      COUNT(DISTINCT person_id) AS competitor_count
    FROM
      results
    GROUP BY
      competition_id
  ),
  competition_values AS (
    SELECT
      comp.id AS competition_id,
      STR_TO_DATE(
        CONCAT(
          comp.year,
          '-',
          LPAD(comp.month, 2, '0'),
          '-',
          LPAD(comp.day, 2, '0')
        ),
        '%Y-%m-%d'
      ) AS start_date,
      comp.latitude_microdegrees AS latitude,
      comp.longitude_microdegrees AS longitude,
      COALESCE(competitor_counts.competitor_count, 0) AS competitor_count
    FROM
      competitions comp
      LEFT JOIN competitor_counts ON competitor_counts.competition_id = comp.id
  )
SELECT
  competition_values.*,
  CASE
    WHEN competitor_count > 0 THEN DENSE_RANK() OVER (
      PARTITION BY
        competitor_count > 0
      ORDER BY
        competitor_count DESC
    )
  END AS competitor_count_rank,
  CASE
    WHEN competitor_count > 0 THEN ROW_NUMBER() OVER (
      PARTITION BY
        competitor_count > 0
      ORDER BY
        competitor_count DESC,
        start_date,
        competition_id
    )
  END AS competitor_count_position,
  CASE
    WHEN latitude BETWEEN -90000000 AND 90000000
    AND longitude BETWEEN -180000000 AND 180000000
    AND NOT (
      latitude = 0
      AND longitude = 0
    ) THEN DENSE_RANK() OVER (
      PARTITION BY
        (
          latitude BETWEEN -90000000 AND 90000000
          AND longitude BETWEEN -180000000 AND 180000000
          AND NOT (
            latitude = 0
            AND longitude = 0
          )
        )
      ORDER BY
        latitude DESC
    )
  END AS northernmost_rank,
  CASE
    WHEN latitude BETWEEN -90000000 AND 90000000
    AND longitude BETWEEN -180000000 AND 180000000
    AND NOT (
      latitude = 0
      AND longitude = 0
    ) THEN ROW_NUMBER() OVER (
      PARTITION BY
        (
          latitude BETWEEN -90000000 AND 90000000
          AND longitude BETWEEN -180000000 AND 180000000
          AND NOT (
            latitude = 0
            AND longitude = 0
          )
        )
      ORDER BY
        latitude DESC,
        start_date,
        competition_id
    )
  END AS northernmost_position,
  CASE
    WHEN latitude BETWEEN -90000000 AND 90000000
    AND longitude BETWEEN -180000000 AND 180000000
    AND NOT (
      latitude = 0
      AND longitude = 0
    ) THEN DENSE_RANK() OVER (
      PARTITION BY
        (
          latitude BETWEEN -90000000 AND 90000000
          AND longitude BETWEEN -180000000 AND 180000000
          AND NOT (
            latitude = 0
            AND longitude = 0
          )
        )
      ORDER BY
        latitude
    )
  END AS southernmost_rank,
  CASE
    WHEN latitude BETWEEN -90000000 AND 90000000
    AND longitude BETWEEN -180000000 AND 180000000
    AND NOT (
      latitude = 0
      AND longitude = 0
    ) THEN ROW_NUMBER() OVER (
      PARTITION BY
        (
          latitude BETWEEN -90000000 AND 90000000
          AND longitude BETWEEN -180000000 AND 180000000
          AND NOT (
            latitude = 0
            AND longitude = 0
          )
        )
      ORDER BY
        latitude,
        start_date,
        competition_id
    )
  END AS southernmost_position
FROM
  competition_values;

ALTER TABLE competition_stats
ADD PRIMARY KEY (competition_id),
ADD INDEX idx_competition_stats_competitor_count (competitor_count_position),
ADD INDEX idx_competition_stats_north (northernmost_position),
ADD INDEX idx_competition_stats_south (southernmost_position);
