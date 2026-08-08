import SQL, { raw } from "sql-template-tag";

export type PersonStatRankingMetric =
  "country-count" | "round-count" | "solve-count";
export type PersonStatRankingScope = "world" | "continent" | "country";
export type PersonStatRankingGender = "all" | "m" | "f" | "o";

export type PersonStatRankingSlice = {
  gender: PersonStatRankingGender;
  metric: PersonStatRankingMetric;
  periodYear: number;
  regionId: string;
  scope: PersonStatRankingScope;
};

const metricColumn = (metric: PersonStatRankingMetric): string => {
  switch (metric) {
    case "country-count":
      return "country_count";
    case "round-count":
      return "round_count";
    case "solve-count":
      return "official_solve_count";
  }
};

const metricStorageValue = (metric: PersonStatRankingMetric): string => {
  switch (metric) {
    case "country-count":
      return "countries";
    case "round-count":
      return "rounds";
    case "solve-count":
      return "solves";
  }
};

export const deletePersonStatRankingSliceQuery = ({
  gender,
  metric,
  periodYear,
  regionId,
  scope,
}: PersonStatRankingSlice) => SQL`
  DELETE FROM person_activity_rankings
  WHERE period_year = ${periodYear}
    AND metric = ${metricStorageValue(metric)}
    AND scope = ${scope}
    AND region_id = ${regionId}
    AND gender = ${gender}
`;

export const insertProvisionalPersonStatRankingSliceQuery = ({
  gender,
  metric,
  periodYear,
  regionId,
  scope,
}: PersonStatRankingSlice) => {
  const column = raw(metricColumn(metric));
  const storageMetric = metricStorageValue(metric);
  return SQL`
    INSERT INTO person_activity_rankings (
      period_year,
      person_id,
      metric,
      scope,
      region_id,
      gender,
      is_provisional,
      metric_value,
      rank,
      position
    )
    WITH cohort AS (
      SELECT person_id, ${column} AS metric_value
      FROM person_period_metrics
      WHERE period_year = ${periodYear}
        AND (
          ${scope} = 'world'
          OR (${scope} = 'continent' AND continent_id = ${regionId})
          OR (${scope} = 'country' AND country_id = ${regionId})
        )
        AND (${gender} = 'all' OR person_gender = ${gender})
    ), ranked AS (
      SELECT
        person_id,
        metric_value,
        RANK() OVER (ORDER BY metric_value DESC) AS rank,
        ROW_NUMBER() OVER (ORDER BY metric_value DESC, person_id) AS position
      FROM cohort
      WHERE metric_value > 0
    )
    SELECT
      ${periodYear},
      person_id,
      ${storageMetric},
      ${scope},
      ${regionId},
      ${gender},
      1,
      metric_value,
      rank,
      position
    FROM ranked
  `;
};
