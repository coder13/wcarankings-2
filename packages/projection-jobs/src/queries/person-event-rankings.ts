import SQL from "sql-template-tag";

export type PersonEventResultType = "single" | "average";

export const deleteProvisionalPersonEventRankingRowsQuery = ({
  eventId,
  resultType,
}: {
  eventId: string;
  resultType: PersonEventResultType;
}) => SQL`
  DELETE FROM person_event_rankings
  WHERE event_id = CONVERT(${eventId} USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND result_type = CONVERT(${resultType} USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND is_provisional = 1
`;

/**
 * Refreshes one full event and result-type slice from shared person_event_bests.
 * The shared grain contains each person's latest official or provisional best.
 * Ranking this set makes World, continent, and country positions agree.
 */
export const upsertProvisionalPersonEventRankingSliceQuery = ({
  eventId,
  resultType,
}: {
  eventId: string;
  resultType: PersonEventResultType;
}) => SQL`
  INSERT INTO person_event_rankings (
    person_id, event_id, result_type, result_id, result_value, country_id,
    continent_id, gender, world_rank, world_position, continent_rank,
    continent_position, country_rank, country_position, is_provisional
  )
  WITH person_candidates AS (
    SELECT
      best.*,
      ROW_NUMBER() OVER (
        PARTITION BY best.person_id
        ORDER BY
          best.result_value,
          best.competition_start_date,
          best.competition_id,
          best.result_id
      ) AS candidate_position
    FROM person_event_bests best
    WHERE best.period_year = 0
      AND best.event_id = CONVERT(${eventId} USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND best.result_type = CONVERT(${resultType} USING utf8mb4) COLLATE utf8mb4_unicode_ci
  ), person_bests AS (
    SELECT * FROM person_candidates WHERE candidate_position = 1
  ), ranked AS (
    SELECT
      best.*,
      DENSE_RANK() OVER (ORDER BY best.result_value) AS world_rank,
      ROW_NUMBER() OVER (
        ORDER BY best.result_value, best.person_id
      ) AS world_position,
      DENSE_RANK() OVER (
        PARTITION BY best.continent_id
        ORDER BY best.result_value
      ) AS continent_rank,
      ROW_NUMBER() OVER (
        PARTITION BY best.continent_id
        ORDER BY best.result_value, best.person_id
      ) AS continent_position,
      DENSE_RANK() OVER (
        PARTITION BY best.country_id
        ORDER BY best.result_value
      ) AS country_rank,
      ROW_NUMBER() OVER (
        PARTITION BY best.country_id
        ORDER BY best.result_value, best.person_id
      ) AS country_position
    FROM person_bests best
  )
  SELECT
    ranked.person_id,
    ranked.event_id,
    ranked.result_type,
    ranked.result_id,
    ranked.result_value,
    ranked.country_id,
    ranked.continent_id,
    ranked.gender,
    ranked.world_rank,
    ranked.world_position,
    ranked.continent_rank,
    ranked.continent_position,
    ranked.country_rank,
    ranked.country_position,
    CASE WHEN ranked.result_id < 0 THEN 1 ELSE 0 END
  FROM ranked
  ON DUPLICATE KEY UPDATE
    result_id = VALUES(result_id),
    result_value = VALUES(result_value),
    country_id = VALUES(country_id),
    continent_id = VALUES(continent_id),
    gender = VALUES(gender),
    world_rank = VALUES(world_rank),
    world_position = VALUES(world_position),
    continent_rank = VALUES(continent_rank),
    continent_position = VALUES(continent_position),
    country_rank = VALUES(country_rank),
    country_position = VALUES(country_position),
    is_provisional = VALUES(is_provisional)
`;
