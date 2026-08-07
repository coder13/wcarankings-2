import { sqlFragment } from "@/lib/helpers/database/sql";

export function yearCountsQuery() {
  return sqlFragment`
    SELECT
      counts.year,
      counts.event_id,
      counts.ranking_type,
      counts.cohort_id,
      cohorts.scope,
      cohorts.region_id,
      counts.count
    FROM (
      SELECT year, event_id, 'single' AS ranking_type, cohort_id, COUNT(*) AS count
      FROM person_year_rankings_single
      GROUP BY year, event_id, cohort_id
      UNION ALL
      SELECT year, event_id, 'average', cohort_id, COUNT(*)
      FROM person_year_rankings_average
      GROUP BY year, event_id, cohort_id
    ) counts
    JOIN person_year_ranking_cohorts cohorts ON cohorts.cohort_id = counts.cohort_id
  `;
}

export function rankingCountsQuery() {
  return sqlFragment`
    SELECT event_id, ranking_type, scope, region_id, count
    FROM ranking_counts
  `;
}

export function rankingMetadataQuery() {
  return sqlFragment`
    SELECT
      \`key\`,
      value
    FROM
      export_metadata
    WHERE
      \`key\` IN ('export_date', 'fetched_at')
  `;
}

export function rankingVersionQuery() {
  return sqlFragment`
    SELECT
      value
    FROM
      export_metadata
    WHERE
      \`key\` = 'fetched_at'
  `;
}

export function requiredRankingTablesQuery(tables: string[]) {
  return sqlFragment`
    SELECT
      table_name AS name
    FROM
      information_schema.tables
    WHERE
      table_schema = DATABASE ()
      AND table_name IN (${tables.map(() => "?").join(", ")})
  `;
}

export function requiredRankingColumnsQuery(
  tables: string[],
  columns: string[],
) {
  return sqlFragment`
    SELECT
      table_name,
      column_name
    FROM
      information_schema.columns
    WHERE
      table_schema = DATABASE ()
      AND table_name IN (${tables.map(() => "?").join(", ")})
      AND column_name IN (${columns.map(() => "?").join(", ")})
  `;
}

export function requiredRankingIndexesQuery(
  tables: string[],
  indexes: string[],
) {
  return sqlFragment`
    SELECT
      table_name,
      index_name
    FROM
      information_schema.statistics
    WHERE
      table_schema = DATABASE ()
      AND table_name IN (${tables.map(() => "?").join(", ")})
      AND index_name IN (${indexes.map(() => "?").join(", ")})
  `;
}
