import SQL from "sql-template-tag";

export const upsertProvisionalCityEventStatsQuery = ({
  competitionId,
  eventId,
}: {
  competitionId: string;
  eventId: string;
}) => SQL`
  INSERT INTO city_event_stats (
    city_name, country_id, event_id, gender, fastest_single,
    fastest_single_result_id, fastest_average, fastest_average_result_id,
    competitor_count, competition_count, official_solve_count,
    fastest_single_rank, fastest_average_rank, is_provisional
  )
  WITH target_city AS (
    SELECT city_name, country_id
    FROM competitions
    WHERE id = ${competitionId}
      AND city_name <> ''
  ), facts AS (
    SELECT
      facts.result_id,
      facts.person_id,
      facts.competition_id,
      facts.competition_start_date,
      facts.best,
      facts.average,
      CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
      COALESCE(attempts.solve_count, 0) AS solve_count
    FROM result_facts facts
    INNER JOIN competitions competition ON competition.id = facts.competition_id
    INNER JOIN target_city city
      ON city.city_name = competition.city_name
      AND city.country_id = competition.country_id
    LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
    LEFT JOIN (
      SELECT result_id, COUNT(*) AS solve_count
      FROM result_attempts
      WHERE value > 0
      GROUP BY result_id
    ) attempts ON attempts.result_id = facts.result_id
    WHERE facts.event_id = ${eventId}
    UNION ALL
    SELECT
      -CAST(live.projection_result_id AS SIGNED),
      live.person_id,
      live.competition_id,
      STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d'),
      live.best,
      live.average,
      CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END,
      (SELECT COUNT(*) FROM JSON_TABLE(live.attempts_json, '$[*]' COLUMNS (value INT PATH '$')) attempts WHERE attempts.value > 0)
    FROM provisional_live_results live
    INNER JOIN provisional_live_result_sources source ON source.source_name = live.source_name AND source.competition_id = live.competition_id AND source.enabled = 1
    INNER JOIN competitions competition ON competition.id = live.competition_id
    INNER JOIN target_city city ON city.city_name = competition.city_name AND city.country_id = competition.country_id
    LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
    WHERE live.event_id = ${eventId}
  ), aggregates AS (
    SELECT
      city.city_name,
      city.country_id,
      ${eventId} AS event_id,
      gender,
      MIN(NULLIF(best, 0)) AS fastest_single,
      MIN(NULLIF(average, 0)) AS fastest_average,
      COUNT(DISTINCT person_id) AS competitor_count,
      COUNT(DISTINCT competition_id) AS competition_count,
      SUM(solve_count) AS official_solve_count
    FROM facts
    CROSS JOIN target_city city
    GROUP BY city.city_name, city.country_id, gender
    UNION ALL
    SELECT city.city_name, city.country_id, ${eventId}, 'all',
      MIN(NULLIF(best, 0)), MIN(NULLIF(average, 0)), COUNT(DISTINCT person_id),
      COUNT(DISTINCT competition_id), SUM(solve_count)
    FROM facts
    CROSS JOIN target_city city
    GROUP BY city.city_name, city.country_id
  ), ranking_values AS (
    SELECT
      stats.city_name,
      stats.country_id,
      stats.event_id,
      stats.gender,
      stats.fastest_single,
      stats.fastest_average,
      stats.competitor_count,
      stats.competition_count,
      stats.official_solve_count,
      0 AS is_target
    FROM city_event_stats stats
    CROSS JOIN target_city city
    WHERE stats.event_id = ${eventId}
      AND NOT (stats.city_name = city.city_name AND stats.country_id = city.country_id)
    UNION ALL
    SELECT
      city_name, country_id, event_id, gender, fastest_single, fastest_average,
      competitor_count, competition_count, official_solve_count, 1
    FROM aggregates
  ), ranked AS (
    SELECT
      ranking_values.*,
      DENSE_RANK() OVER (PARTITION BY gender ORDER BY fastest_single) AS fastest_single_rank,
      DENSE_RANK() OVER (PARTITION BY gender ORDER BY fastest_average) AS fastest_average_rank
    FROM ranking_values
  )
  SELECT city_name, country_id, event_id, gender, fastest_single, NULL,
    fastest_average, NULL, competitor_count, competition_count, official_solve_count,
    fastest_single_rank, fastest_average_rank, 1
  FROM ranked
  WHERE is_target = 1
  ON DUPLICATE KEY UPDATE
    fastest_single = VALUES(fastest_single), fastest_average = VALUES(fastest_average),
    competitor_count = VALUES(competitor_count), competition_count = VALUES(competition_count),
    official_solve_count = VALUES(official_solve_count),
    fastest_single_rank = VALUES(fastest_single_rank), fastest_average_rank = VALUES(fastest_average_rank),
    is_provisional = VALUES(is_provisional)
`;
