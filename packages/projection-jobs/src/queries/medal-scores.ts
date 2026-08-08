import SQL from "sql-template-tag";

type MedalScoreInput = { personId: string; year: number };

export const deletePersonMedalScoresQuery = ({
  personId,
  year,
}: MedalScoreInput) => SQL`
  DELETE FROM person_medal_scores
  WHERE person_id = ${personId}
    AND year = ${year}
`;

export const insertPersonMedalScoresQuery = ({
  personId,
  year,
}: MedalScoreInput) => SQL`
  INSERT INTO person_medal_scores (
    year, event_id, person_id, person_gender, country_id, continent_id,
    is_provisional, gold_count, silver_count, bronze_count
  )
  WITH facts AS (
    SELECT
      facts.event_id,
      facts.person_id,
      facts.person_country_id AS country_id,
      facts.person_continent_id AS continent_id,
      facts.position
    FROM result_facts facts
    WHERE facts.person_id = ${personId}
      AND facts.competition_year = ${year}
      AND facts.is_final_round = 1
      AND facts.position BETWEEN 1 AND 3
      AND (facts.best > 0 OR facts.average > 0)
    UNION ALL
    SELECT
      live.event_id,
      live.person_id,
      country.id,
      country.continent_id,
      live.position
    FROM provisional_live_results live
    INNER JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name
      AND source.competition_id = live.competition_id
      AND source.enabled = 1
    INNER JOIN competitions competition ON competition.id = live.competition_id
    INNER JOIN countries country ON country.iso2 = live.country_iso2
    WHERE live.person_id = ${personId}
      AND competition.year = ${year}
      AND live.position BETWEEN 1 AND 3
      AND live.round_number = (
        SELECT MAX(other_live.round_number)
        FROM provisional_live_results other_live
        WHERE other_live.source_name = live.source_name
          AND other_live.competition_id = live.competition_id
          AND other_live.event_id = live.event_id
      )
      AND (live.best > 0 OR live.average > 0)
  )
  SELECT
    ${year},
    facts.event_id,
    facts.person_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END,
    facts.country_id,
    facts.continent_id,
    1,
    SUM(facts.position = 1),
    SUM(facts.position = 2),
    SUM(facts.position = 3)
  FROM facts
  LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  GROUP BY facts.event_id, facts.person_id, person.gender, facts.country_id, facts.continent_id
`;
