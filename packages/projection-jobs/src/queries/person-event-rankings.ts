import SQL, { raw } from "sql-template-tag";

export type PersonEventResultType = "single" | "average";

const resultValueColumn = (resultType: PersonEventResultType): string =>
  resultType === "single" ? "best" : "average";

export const affectedPersonEventIdsQuery = (personIds: string[]) => SQL`
  SELECT DISTINCT event_id
  FROM provisional_live_results
  WHERE person_id IN (${personIds})
`;

export const upsertProvisionalPersonEventRankingsQuery = ({
  eventId,
  resultType,
}: {
  eventId: string;
  resultType: PersonEventResultType;
}) => {
  const valueColumn = raw(resultValueColumn(resultType));
  return SQL`
    INSERT INTO person_event_rankings (
      person_id, event_id, result_type, result_id, result_value, country_id,
      continent_id, gender, world_rank, world_position, continent_rank,
      continent_position, country_rank, country_position, previous_world_rank,
      previous_continent_rank, previous_country_rank, world_rank_delta,
      continent_rank_delta, country_rank_delta, rank_delta_state,
      is_provisional
    )
    WITH candidates AS (
      SELECT
        facts.person_id,
        facts.event_id,
        facts.result_id,
        facts.${valueColumn} AS result_value,
        facts.person_country_id AS country_id,
        facts.person_continent_id AS continent_id,
        CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
        facts.competition_start_date,
        facts.competition_id
      FROM result_facts facts
      INNER JOIN persons person
        ON person.wca_id = facts.person_id AND person.sub_id = 1
      WHERE facts.event_id = ${eventId} AND facts.${valueColumn} > 0
      UNION ALL
      SELECT
        live.person_id,
        live.event_id,
        -CAST(live.projection_result_id AS SIGNED),
        live.${valueColumn},
        country.id,
        country.continent_id,
        CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
        STR_TO_DATE(
          CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')),
          '%Y-%m-%d'
        ),
        live.competition_id
      FROM provisional_live_results live
      INNER JOIN provisional_live_result_sources source
        ON source.source_name = live.source_name
        AND source.competition_id = live.competition_id
        AND source.enabled = 1
      INNER JOIN persons person
        ON person.wca_id = live.person_id AND person.sub_id = 1
      INNER JOIN countries country ON country.iso2 = live.country_iso2
      INNER JOIN competitions competition ON competition.id = live.competition_id
      WHERE live.event_id = ${eventId} AND live.${valueColumn} > 0
    ), bests AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY person_id
        ORDER BY result_value, competition_start_date, competition_id, result_id
      ) AS best_position
      FROM candidates
    ), values_by_person AS (
      SELECT * FROM bests WHERE best_position = 1
    )
    SELECT
      person_id,
      event_id,
      ${resultType},
      result_id,
      result_value,
      country_id,
      continent_id,
      gender,
      DENSE_RANK() OVER (ORDER BY result_value),
      ROW_NUMBER() OVER (ORDER BY result_value, person_id),
      DENSE_RANK() OVER (PARTITION BY continent_id ORDER BY result_value),
      ROW_NUMBER() OVER (PARTITION BY continent_id ORDER BY result_value, person_id),
      DENSE_RANK() OVER (PARTITION BY country_id ORDER BY result_value),
      ROW_NUMBER() OVER (PARTITION BY country_id ORDER BY result_value, person_id),
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      'unchanged',
      1
    FROM values_by_person
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
      previous_world_rank = VALUES(previous_world_rank),
      previous_continent_rank = VALUES(previous_continent_rank),
      previous_country_rank = VALUES(previous_country_rank),
      world_rank_delta = VALUES(world_rank_delta),
      continent_rank_delta = VALUES(continent_rank_delta),
      country_rank_delta = VALUES(country_rank_delta),
      rank_delta_state = VALUES(rank_delta_state),
      is_provisional = VALUES(is_provisional)
  `;
};
