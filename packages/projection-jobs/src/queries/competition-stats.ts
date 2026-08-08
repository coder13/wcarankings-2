import SQL from "sql-template-tag";

export const upsertProvisionalCompetitionStatsQuery = (
  competitionId: string,
) => SQL`
  INSERT INTO competition_stats (
    competition_id, start_date, latitude, longitude, competitor_count,
    competitor_count_rank, competitor_count_position, northernmost_rank,
    northernmost_position, southernmost_rank, southernmost_position,
    is_provisional
  )
  WITH target_competitors AS (
    SELECT COUNT(DISTINCT person_id) AS competitor_count
    FROM (
      SELECT person_id FROM results WHERE competition_id = ${competitionId}
      UNION
      SELECT person_id
      FROM provisional_live_results
      WHERE competition_id = ${competitionId}
    ) people
  ), values_by_competition AS (
    SELECT
      stats.competition_id,
      stats.start_date,
      stats.latitude,
      stats.longitude,
      IF(stats.competition_id = ${competitionId}, target.competitor_count, stats.competitor_count) AS competitor_count
    FROM competition_stats stats
    CROSS JOIN target_competitors target
  )
  SELECT
    ranking_values.competition_id,
    ranking_values.start_date,
    ranking_values.latitude,
    ranking_values.longitude,
    ranking_values.competitor_count,
    DENSE_RANK() OVER (ORDER BY ranking_values.competitor_count DESC),
    ROW_NUMBER() OVER (
      ORDER BY ranking_values.competitor_count DESC,
        ranking_values.start_date, ranking_values.competition_id
    ),
    CASE WHEN ranking_values.latitude BETWEEN -90000000 AND 90000000
        AND ranking_values.longitude BETWEEN -180000000 AND 180000000
        AND NOT (ranking_values.latitude = 0 AND ranking_values.longitude = 0)
      THEN DENSE_RANK() OVER (ORDER BY ranking_values.latitude DESC)
    END,
    CASE WHEN ranking_values.latitude BETWEEN -90000000 AND 90000000
        AND ranking_values.longitude BETWEEN -180000000 AND 180000000
        AND NOT (ranking_values.latitude = 0 AND ranking_values.longitude = 0)
      THEN ROW_NUMBER() OVER (
        ORDER BY ranking_values.latitude DESC, ranking_values.start_date,
          ranking_values.competition_id
      )
    END,
    CASE WHEN ranking_values.latitude BETWEEN -90000000 AND 90000000
        AND ranking_values.longitude BETWEEN -180000000 AND 180000000
        AND NOT (ranking_values.latitude = 0 AND ranking_values.longitude = 0)
      THEN DENSE_RANK() OVER (ORDER BY ranking_values.latitude)
    END,
    CASE WHEN ranking_values.latitude BETWEEN -90000000 AND 90000000
        AND ranking_values.longitude BETWEEN -180000000 AND 180000000
        AND NOT (ranking_values.latitude = 0 AND ranking_values.longitude = 0)
      THEN ROW_NUMBER() OVER (
        ORDER BY ranking_values.latitude, ranking_values.start_date,
          ranking_values.competition_id
      )
    END,
    1
  FROM values_by_competition ranking_values
  ON DUPLICATE KEY UPDATE
    start_date = VALUES(start_date),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    competitor_count = VALUES(competitor_count),
    competitor_count_rank = VALUES(competitor_count_rank),
    competitor_count_position = VALUES(competitor_count_position),
    northernmost_rank = VALUES(northernmost_rank),
    northernmost_position = VALUES(northernmost_position),
    southernmost_rank = VALUES(southernmost_rank),
    southernmost_position = VALUES(southernmost_position),
    is_provisional = VALUES(is_provisional)
`;

export const upsertProvisionalCompetitionEventStatsQuery = ({
  competitionId,
  eventId,
}: {
  competitionId: string;
  eventId: string;
}) => SQL`
  INSERT INTO competition_event_stats (
    competition_id, event_id, start_date, fastest_single,
    fastest_single_result_id, fastest_average, fastest_average_result_id,
    podium_score, fastest_single_rank, fastest_single_position,
    fastest_average_rank, fastest_average_position, podium_rank,
    podium_position, is_provisional
  )
  WITH live_values AS (
    SELECT
      MIN(CASE WHEN best > 0 THEN best END) AS fastest_single,
      MIN(CASE WHEN average > 0 THEN average END) AS fastest_average
    FROM provisional_live_results
    WHERE competition_id = ${competitionId} AND event_id = ${eventId}
  ), values_by_competition AS (
    SELECT
      stats.competition_id,
      stats.event_id,
      stats.start_date,
      IF(stats.competition_id = ${competitionId}, live.fastest_single, stats.fastest_single) AS fastest_single,
      stats.fastest_single_result_id,
      IF(stats.competition_id = ${competitionId}, live.fastest_average, stats.fastest_average) AS fastest_average,
      stats.fastest_average_result_id,
      stats.podium_score,
      stats.podium_rank,
      stats.podium_position
    FROM competition_event_stats stats
    CROSS JOIN live_values live
    WHERE stats.event_id = ${eventId}
  )
  SELECT
    ranking_values.competition_id,
    ranking_values.event_id,
    ranking_values.start_date,
    ranking_values.fastest_single,
    ranking_values.fastest_single_result_id,
    ranking_values.fastest_average,
    ranking_values.fastest_average_result_id,
    ranking_values.podium_score,
    CASE WHEN ranking_values.fastest_single IS NOT NULL
      THEN RANK() OVER (ORDER BY ranking_values.fastest_single)
    END,
    CASE WHEN ranking_values.fastest_single IS NOT NULL
      THEN ROW_NUMBER() OVER (
        ORDER BY ranking_values.fastest_single, ranking_values.start_date,
          ranking_values.competition_id
      )
    END,
    CASE WHEN ranking_values.fastest_average IS NOT NULL
      THEN RANK() OVER (ORDER BY ranking_values.fastest_average)
    END,
    CASE WHEN ranking_values.fastest_average IS NOT NULL
      THEN ROW_NUMBER() OVER (
        ORDER BY ranking_values.fastest_average, ranking_values.start_date,
          ranking_values.competition_id
      )
    END,
    ranking_values.podium_rank,
    ranking_values.podium_position,
    1
  FROM values_by_competition ranking_values
  ON DUPLICATE KEY UPDATE
    start_date = VALUES(start_date),
    fastest_single = VALUES(fastest_single),
    fastest_average = VALUES(fastest_average),
    fastest_single_rank = VALUES(fastest_single_rank),
    fastest_single_position = VALUES(fastest_single_position),
    fastest_average_rank = VALUES(fastest_average_rank),
    fastest_average_position = VALUES(fastest_average_position),
    is_provisional = VALUES(is_provisional)
`;
