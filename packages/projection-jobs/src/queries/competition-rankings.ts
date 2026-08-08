import SQL from "sql-template-tag";

export type CompetitionRankingScope = "world" | "continent" | "country";
export type CompetitionRankingGender = "all" | "m" | "f" | "o";

export type CompetitionRankingSlice = {
  gender: CompetitionRankingGender;
  regionId: string;
  scope: CompetitionRankingScope;
};

export const deleteCompetitionRankingSliceQuery = ({
  gender,
  regionId,
  scope,
}: CompetitionRankingSlice) => SQL`
  DELETE FROM person_competition_rankings
  WHERE scope = ${scope}
    AND region_id = ${regionId}
    AND gender = ${gender}
`;

export const insertProvisionalCompetitionRankingSliceQuery = ({
  gender,
  regionId,
  scope,
}: CompetitionRankingSlice) => SQL`
  INSERT INTO person_competition_rankings (
    person_id,
    competition_count,
    scope,
    region_id,
    gender,
    is_provisional,
    rank,
    position
  )
  WITH cohort AS (
    SELECT person_id, competition_count
    FROM person_period_metrics
    WHERE period_year = 0
      AND (${scope} = 'world' OR (${scope} = 'continent' AND continent_id = ${regionId}) OR (
        ${scope} = 'country' AND country_id = ${regionId}
      ))
      AND (${gender} = 'all' OR person_gender = ${gender})
  ), ranked AS (
    SELECT
      person_id,
      competition_count,
      RANK() OVER (ORDER BY competition_count DESC) AS rank,
      ROW_NUMBER() OVER (
        ORDER BY competition_count DESC, person_id
      ) AS position
    FROM cohort
  )
  SELECT
    person_id,
    competition_count,
    ${scope},
    ${regionId},
    ${gender},
    1,
    rank,
    position
  FROM ranked
`;
