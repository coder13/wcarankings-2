import SQL from "sql-template-tag";

export type SumOfRanksScope = "continent" | "country";

export type SumOfRanksScopeInput = {
  regionId: string;
  scope: SumOfRanksScope;
};

const eventIds = SQL`(
  '333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh',
  'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf'
)`;

const scopePredicate = ({ regionId, scope }: SumOfRanksScopeInput) =>
  scope === "country"
    ? SQL`best.country_id = ${regionId}`
    : SQL`best.continent_id = ${regionId}`;

export const createSumOfRanksEventValuesQuery = (
  input: SumOfRanksScopeInput,
) => SQL`
  CREATE TEMPORARY TABLE projection_sum_of_ranks_event_values AS
  WITH scope_candidates AS (
    SELECT
      best.result_type,
      best.event_id,
      best.person_id,
      best.gender,
      best.result_value,
      best.competition_start_date,
      best.competition_id,
      best.result_id,
      ROW_NUMBER() OVER (
        PARTITION BY best.result_type, best.event_id, best.person_id
        ORDER BY
          best.result_value,
          best.competition_start_date,
          best.competition_id,
          best.result_id
      ) AS best_position
    FROM person_event_bests best
    WHERE best.period_year = 0
      AND best.country_id <> ''
      AND best.event_id IN ${eventIds}
      AND (best.result_type = 'single' OR best.event_id <> '333mbf')
      AND ${scopePredicate(input)}
  )
  SELECT
    CAST(result_type AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_uca1400_ai_ci AS result_type,
    CONVERT(event_id USING ascii) AS event_id,
    CONVERT(person_id USING ascii) AS person_id,
    gender,
    result_value,
    RANK() OVER (
      PARTITION BY result_type, event_id
      ORDER BY result_value
    ) AS event_rank
  FROM scope_candidates
  WHERE best_position = 1
`;

export const indexSumOfRanksEventValuesQuery = SQL`
  ALTER TABLE projection_sum_of_ranks_event_values
  ADD PRIMARY KEY (result_type, person_id, event_id),
  ADD INDEX idx_projection_sum_of_ranks_event (
    result_type, event_id, result_value, person_id
  )
`;

export const createSumOfRanksPenaltiesQuery = SQL`
  CREATE TEMPORARY TABLE projection_sum_of_ranks_penalties AS
  SELECT
    result_type,
    event_id,
    COUNT(*) + 1 AS fallback_rank,
    MIN(result_value) AS reference_result
  FROM projection_sum_of_ranks_event_values
  GROUP BY result_type, event_id
`;

export const indexSumOfRanksPenaltiesQuery = SQL`
  ALTER TABLE projection_sum_of_ranks_penalties
  ADD PRIMARY KEY (result_type, event_id)
`;

export const createSumOfRanksKinchValuesQuery = SQL`
  CREATE TEMPORARY TABLE projection_sum_of_ranks_kinch_values AS
  WITH ratios AS (
    SELECT
      value.person_id,
      value.event_id,
      MAX(
        CASE
          WHEN value.result_type = 'single' THEN CASE
            WHEN value.event_id = '333mbf' THEN 100.0 * GREATEST(
              0,
              (
                (99 - FLOOR(value.result_value / 10000000) % 100) + 1 - CASE
                  WHEN FLOOR(value.result_value / 100) % 100000 = 99999 THEN 0
                  ELSE (FLOOR(value.result_value / 100) % 100000 * 100.0) / 360000
                END
              )
            ) / NULLIF(
              GREATEST(
                0,
                (
                  (99 - FLOOR(penalty.reference_result / 10000000) % 100) + 1 - CASE
                    WHEN FLOOR(penalty.reference_result / 100) % 100000 = 99999 THEN 0
                    ELSE (FLOOR(penalty.reference_result / 100) % 100000 * 100.0) / 360000
                  END
                )
              ),
              0
            )
            ELSE 100.0 * penalty.reference_result / value.result_value
          END
        END
      ) AS single_ratio,
      MAX(
        CASE
          WHEN value.result_type = 'average' THEN 100.0 * penalty.reference_result / value.result_value
        END
      ) AS average_ratio
    FROM projection_sum_of_ranks_event_values value
    INNER JOIN projection_sum_of_ranks_penalties penalty
      ON penalty.result_type = value.result_type
      AND penalty.event_id = value.event_id
    GROUP BY value.person_id, value.event_id
  )
  SELECT
    person_id,
    event_id,
    CASE
      WHEN event_id = '333mbf' THEN COALESCE(single_ratio, 0)
      WHEN event_id IN ('333fm', '333bf', '444bf', '555bf') THEN GREATEST(
        COALESCE(single_ratio, 0),
        COALESCE(average_ratio, 0)
      )
      ELSE COALESCE(average_ratio, 0)
    END AS kinch_value
  FROM ratios
`;

export const indexSumOfRanksKinchValuesQuery = SQL`
  ALTER TABLE projection_sum_of_ranks_kinch_values
  ADD PRIMARY KEY (person_id, event_id)
`;

export const deleteSumOfRanksScopeQuery = ({
  regionId,
  scope,
}: SumOfRanksScopeInput) => SQL`
  DELETE FROM person_sum_of_ranks_scores
  WHERE metric_version = 1
    AND event_set_version = 1
    AND scope = ${scope}
    AND region_id = ${regionId}
`;

export const insertProvisionalSumOfRanksScopeQuery = ({
  continentId,
  regionId,
  scope,
}: SumOfRanksScopeInput & { continentId: string }) => {
  const continentScoreJoin =
    scope === "country"
      ? SQL`
          LEFT JOIN person_sum_of_ranks_scores continent_score
            ON continent_score.metric_version = 1
            AND continent_score.event_set_version = 1
            AND continent_score.result_type = adjustment.result_type
            AND continent_score.scope = 'continent'
            AND continent_score.region_id = ${continentId}
            AND continent_score.person_id = adjustment.person_id
        `
      : SQL``;
  const continentKinchScore =
    scope === "country"
      ? SQL`COALESCE(continent_score.kinch_score, kinch.kinch_score)`
      : SQL`kinch.kinch_score`;

  return SQL`
    INSERT INTO person_sum_of_ranks_scores (
    metric_version,
    event_set_version,
    result_type,
    scope,
    region_id,
    person_id,
    gender,
    is_provisional,
    score,
    coverage,
    required_coverage,
    kinch_score,
    kinch_coverage,
    kinch_continent_score,
    kinch_continent_rank,
    kinch_continent_position,
    rank,
    position,
    kinch_rank,
    kinch_position
  )
  WITH baselines AS (
    SELECT
      result_type,
      SUM(fallback_rank) + (CASE WHEN result_type = 'single' THEN 17 ELSE 16 END) - COUNT(*) AS fallback_score,
      CASE WHEN result_type = 'single' THEN 17 ELSE 16 END AS required_coverage
    FROM projection_sum_of_ranks_penalties
    GROUP BY result_type
  ),
  person_adjustments AS (
    SELECT
      value.result_type,
      value.person_id,
      MAX(value.gender) AS gender,
      SUM(CAST(value.event_rank AS SIGNED) - CAST(penalty.fallback_rank AS SIGNED)) AS score_adjustment,
      COUNT(*) AS coverage
    FROM projection_sum_of_ranks_event_values value
    INNER JOIN projection_sum_of_ranks_penalties penalty
      ON penalty.result_type = value.result_type
      AND penalty.event_id = value.event_id
    GROUP BY value.result_type, value.person_id
  ),
  kinch_totals AS (
    SELECT
      person_id,
      SUM(kinch_value) AS kinch_score,
      COUNT(*) AS kinch_coverage
    FROM projection_sum_of_ranks_kinch_values
    GROUP BY person_id
  ),
  totals AS (
    SELECT
      adjustment.result_type,
      adjustment.person_id,
      CASE WHEN adjustment.gender IN ('m', 'f') THEN adjustment.gender ELSE 'o' END AS gender,
      CAST(baseline.fallback_score AS SIGNED) + adjustment.score_adjustment AS score,
      adjustment.coverage,
      baseline.required_coverage,
      kinch.kinch_score,
      kinch.kinch_coverage,
      ${continentKinchScore} AS kinch_continent_score
    FROM person_adjustments adjustment
    INNER JOIN baselines baseline ON baseline.result_type = adjustment.result_type
    INNER JOIN kinch_totals kinch ON kinch.person_id = adjustment.person_id
    ${continentScoreJoin}
  ),
  ranked AS (
    SELECT
      totals.*,
      RANK() OVER (PARTITION BY result_type ORDER BY score) AS rank,
      ROW_NUMBER() OVER (PARTITION BY result_type ORDER BY score, person_id) AS position,
      RANK() OVER (PARTITION BY result_type ORDER BY kinch_score DESC) AS kinch_rank,
      ROW_NUMBER() OVER (PARTITION BY result_type ORDER BY kinch_score DESC, person_id) AS kinch_position,
      RANK() OVER (PARTITION BY result_type ORDER BY kinch_continent_score DESC) AS kinch_continent_rank,
      ROW_NUMBER() OVER (
        PARTITION BY result_type
        ORDER BY kinch_continent_score DESC, person_id
      ) AS kinch_continent_position
    FROM totals
  )
  SELECT
    1,
    1,
    result_type,
    ${scope},
    ${regionId},
    person_id,
    gender,
    1,
    score,
    coverage,
    required_coverage,
    kinch_score,
    kinch_coverage,
    kinch_continent_score,
    kinch_continent_rank,
    kinch_continent_position,
    rank,
    position,
    kinch_rank,
    kinch_position
    FROM ranked
  `;
};

export const continentForCountryQuery = (countryId: string) => SQL`
  SELECT continent_id
  FROM countries
  WHERE id = ${countryId}
`;

export const dropSumOfRanksStageQueries = [
  SQL`DROP TEMPORARY TABLE IF EXISTS projection_sum_of_ranks_kinch_values`,
  SQL`DROP TEMPORARY TABLE IF EXISTS projection_sum_of_ranks_penalties`,
  SQL`DROP TEMPORARY TABLE IF EXISTS projection_sum_of_ranks_event_values`,
];
