import SQL from "sql-template-tag";

export const deleteMedalRankingSliceQuery = ({
  eventId,
  scope,
  regionId,
}: {
  eventId: string;
  scope: string;
  regionId: string;
}) => SQL`
  DELETE FROM person_medal_rankings
  WHERE event_id = ${eventId}
    AND scope = ${scope}
    AND region_id = ${regionId}
`;

export const replaceMedalRankingSliceQuery = ({
  eventId,
  scope,
  regionId,
}: {
  eventId: string;
  scope: string;
  regionId: string;
}) => SQL`
  INSERT INTO person_medal_rankings (
    event_id, person_id, scope, region_id, medal_type, medal_count,
    is_provisional, rank, position
  )
  WITH scores AS (
    SELECT person_id, SUM(gold_count) AS gold_count, SUM(silver_count) AS silver_count,
      SUM(bronze_count) AS bronze_count
    FROM person_medal_scores
    WHERE event_id = ${eventId}
      AND (${scope} = 'world' OR (${scope} = 'continent' AND continent_id = ${regionId}) OR (${scope} = 'country' AND country_id = ${regionId}))
    GROUP BY person_id
  ), values_by_type AS (
    SELECT person_id, 'overall' AS medal_type, gold_count + silver_count + bronze_count AS medal_count FROM scores
    UNION ALL SELECT person_id, 'gold', gold_count FROM scores
    UNION ALL SELECT person_id, 'silver', silver_count FROM scores
    UNION ALL SELECT person_id, 'bronze', bronze_count FROM scores
  ), ranked AS (
    SELECT person_id, medal_type, medal_count,
      RANK() OVER (PARTITION BY medal_type ORDER BY medal_count DESC) AS rank,
      ROW_NUMBER() OVER (PARTITION BY medal_type ORDER BY medal_count DESC, person_id) AS position
    FROM values_by_type
    WHERE medal_count > 0
  )
  SELECT ${eventId}, person_id, ${scope}, ${regionId}, medal_type, medal_count, 1, rank, position
  FROM ranked
  ON DUPLICATE KEY UPDATE medal_count = VALUES(medal_count), is_provisional = VALUES(is_provisional), rank = VALUES(rank), position = VALUES(position)
`;
