import type {
  CompetitionEntityQueryInput,
  FilteredPersonMetricQueryInput,
  GenderRankingQueryInput,
  LatitudeQueryInput,
  PersonMetricQueryInput,
  PodiumEntityQueryInput,
  RankingCursorQueryInput,
  RankingPageQueryInput,
  RankingSearchQueryInput,
  ResultRankingsQueryInput,
} from "@/services/rankings/types";
import { escapeSqlIdentifier, sqlFragment } from "@/lib/helpers/database/sql";

export function competitorCountRowsQuery() {
  return sqlFragment`WITH page AS (SELECT stats.competition_id, stats.competitor_count, stats.competitor_count_rank AS rank, stats.competitor_count_position AS position FROM competition_stats stats WHERE stats.competitor_count_position > ? ORDER BY stats.competitor_count_position LIMIT ?) SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name, COALESCE(competition.venue, '') AS venue, COALESCE(competition.city_name, '') AS city_name, COALESCE(country.name, competition.country_id, '') AS country_name, COALESCE(country.iso2, '') AS country_iso2 FROM page LEFT JOIN competitions competition ON competition.id = page.competition_id LEFT JOIN countries country ON country.id = competition.country_id ORDER BY page.position`;
}
export function competitorCountTotalQuery() {
  return "SELECT COUNT(*) AS count FROM competition_stats WHERE competitor_count_position IS NOT NULL";
}
export function latitudeRowsQuery(input: LatitudeQueryInput) {
  return input.scoped
    ? `WITH scoped AS (SELECT stats.competition_id, stats.start_date, stats.latitude, COALESCE(competition.name, stats.competition_id) AS competition_name, COALESCE(competition.venue, '') AS venue, COALESCE(competition.city_name, '') AS city_name, COALESCE(country.name, competition.country_id, '') AS country_name, COALESCE(country.iso2, '') AS country_iso2 FROM competition_stats stats JOIN competitions competition ON competition.id = stats.competition_id JOIN countries country ON country.id = competition.country_id WHERE stats.${input.prefix}_position IS NOT NULL AND ${input.regionColumn} = ?), ranked AS (SELECT scoped.*, DENSE_RANK() OVER (ORDER BY latitude ${input.direction}) AS rank, ROW_NUMBER() OVER (ORDER BY latitude ${input.direction}, start_date, competition_id) AS position FROM scoped) SELECT * FROM ranked WHERE position > ? ORDER BY position LIMIT ?`
    : `WITH page AS (SELECT stats.competition_id, stats.latitude, stats.${input.prefix}_rank AS rank, stats.${input.prefix}_position AS position FROM competition_stats stats WHERE stats.${input.prefix}_position > ? ORDER BY stats.${input.prefix}_position LIMIT ?) SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name, COALESCE(competition.venue, '') AS venue, COALESCE(competition.city_name, '') AS city_name, COALESCE(country.name, competition.country_id, '') AS country_name, COALESCE(country.iso2, '') AS country_iso2 FROM page LEFT JOIN competitions competition ON competition.id = page.competition_id LEFT JOIN countries country ON country.id = competition.country_id ORDER BY page.position`;
}
export function latitudeCountQuery(input: LatitudeQueryInput) {
  return input.scoped
    ? `SELECT COUNT(*) AS count FROM competition_stats stats JOIN competitions competition ON competition.id = stats.competition_id JOIN countries country ON country.id = competition.country_id WHERE stats.${input.prefix}_position IS NOT NULL AND ${input.regionColumn} = ?`
    : `SELECT COUNT(*) AS count FROM competition_stats WHERE ${input.prefix}_position IS NOT NULL`;
}
export function competitionEntityRowsQuery(input: CompetitionEntityQueryInput) {
  const valueColumn = escapeSqlIdentifier(input.valueColumn);
  const resultIdColumn = escapeSqlIdentifier(input.resultIdColumn);
  const rankColumn = escapeSqlIdentifier(input.rankColumn);
  const positionColumn = escapeSqlIdentifier(input.positionColumn);
  return sqlFragment`WITH page AS (SELECT stats.competition_id, stats.start_date, stats.${valueColumn} AS result_value, stats.${resultIdColumn} AS result_id, stats.${rankColumn} AS rank, stats.${positionColumn} AS position FROM competition_event_stats stats WHERE stats.event_id = ? AND stats.${positionColumn} > ? ORDER BY stats.${positionColumn} LIMIT ?) SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name, COALESCE(country.name, competition.country_id, '') AS country_name, COALESCE(country.iso2, '') AS country_iso2, result.person_id, COALESCE(person.name, result.person_id) AS person_name FROM page INNER JOIN results result ON result.id = page.result_id LEFT JOIN persons person ON person.wca_id = result.person_id AND person.sub_id = 1 LEFT JOIN competitions competition ON competition.id = page.competition_id LEFT JOIN countries country ON country.id = competition.country_id ORDER BY page.position`;
}
export function competitionEntityCountQuery(
  input: CompetitionEntityQueryInput,
) {
  return sqlFragment`SELECT COUNT(*) AS count FROM competition_event_stats WHERE event_id = ? AND ${escapeSqlIdentifier(input.positionColumn)} IS NOT NULL`;
}
export function podiumEntityRowsQuery(input: PodiumEntityQueryInput) {
  const positionColumn = escapeSqlIdentifier(input.positionColumn);
  return sqlFragment`WITH page AS (SELECT stats.competition_id, stats.start_date, stats.podium_score AS score, stats.podium_rank AS rank, stats.${positionColumn} AS position FROM competition_event_stats stats WHERE stats.event_id = ? AND stats.${positionColumn} > ? ORDER BY stats.${positionColumn} LIMIT ?) SELECT page.*, COALESCE(competition.name, page.competition_id) AS competition_name, COALESCE(competition.country_id, '') AS country_id, COALESCE(country.name, competition.country_id, '') AS country_name, COALESCE(country.iso2, '') AS country_iso2, member.podium_position, member.person_id AS member_person_id, COALESCE(person.name, member.person_id) AS member_person_name, member.result_id AS member_result_id, member.result_value AS member_result_value FROM page INNER JOIN competition_podium_members member ON member.competition_id = page.competition_id AND member.event_id = ? AND member.result_type = ? LEFT JOIN persons person ON person.wca_id = member.person_id AND person.sub_id = 1 LEFT JOIN competitions competition ON competition.id = page.competition_id LEFT JOIN countries country ON country.id = competition.country_id ORDER BY page.position, member.podium_position, member.result_id`;
}
export function podiumEntityCountQuery(input: PodiumEntityQueryInput) {
  return sqlFragment`SELECT COUNT(*) AS count FROM competition_event_stats WHERE event_id = ? AND ${escapeSqlIdentifier(input.positionColumn)} IS NOT NULL`;
}
export function yearCountsQuery() {
  return sqlFragment`SELECT counts.year, counts.event_id, counts.ranking_type, counts.cohort_id, cohorts.scope, cohorts.region_id, counts.count
      FROM person_year_ranking_counts counts
      JOIN person_year_ranking_cohorts cohorts ON cohorts.cohort_id = counts.cohort_id`;
}

export function rankingCountsQuery() {
  return "SELECT event_id, ranking_type, scope, region_id, count FROM ranking_counts";
}

export function rankingMetadataQuery() {
  return "SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')";
}

export function rankingVersionQuery() {
  return "SELECT value FROM export_metadata WHERE `key` = 'fetched_at'";
}

export function requiredRankingTablesQuery(tables: string[]) {
  return sqlFragment`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => "?").join(", ")})`;
}

export function requiredRankingColumnsQuery(
  tables: string[],
  columns: string[],
) {
  return sqlFragment`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => "?").join(", ")}) AND column_name IN (${columns.map(() => "?").join(", ")})`;
}

export function requiredRankingIndexesQuery(
  tables: string[],
  indexes: string[],
) {
  return sqlFragment`SELECT table_name, index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => "?").join(", ")}) AND index_name IN (${indexes.map(() => "?").join(", ")})`;
}

export function personCompetitionRankingRowsQuery() {
  return sqlFragment`WITH page AS (
      SELECT ranking.person_id, ranking.competition_count, ranking.rank, ranking.position
      FROM person_competition_rankings ranking
      WHERE ranking.scope = ? AND ranking.region_id = ? AND ranking.gender = ?
        AND ranking.position >= ?
      ORDER BY ranking.position, ranking.person_id
      LIMIT ?
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = person.country_id
    ORDER BY page.position, page.person_id`;
}

export function personCompetitionRankingCountQuery() {
  return sqlFragment`SELECT count FROM person_competition_ranking_counts
    WHERE scope = ? AND region_id = ? AND gender = ?`;
}

export function resultRankingsQuery(input: ResultRankingsQueryInput) {
  return sqlFragment`WITH page AS (
      SELECT
        ranking.result_id,
        ranking.attempt_number,
        ranking.result_value,
        ranking.${input.rankColumn} AS rank,
        ranking.${input.positionColumn} AS position,
        ranking.person_id,
        ranking.country_id,
        ranking.continent_id,
        ranking.competition_id,
        ranking.record_code
      FROM ${input.source} ranking
      WHERE ${input.conditions.join(" AND ")}
      ORDER BY ranking.${input.positionColumn}
      LIMIT ?
    )
    SELECT
      page.*,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    ORDER BY page.position`;
}

export function resultRankingCountsQuery() {
  return "SELECT count FROM result_ranking_counts WHERE event_id = ? AND result_type = ? AND scope = ? AND region_id = ?";
}

export function lazySingleResultRankingsQuery(conditions: string[]) {
  return sqlFragment`WITH scoped AS (
      SELECT solve.*,
        RANK() OVER (ORDER BY solve.result_value) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY solve.result_value, solve.competition_start_date, solve.competition_id,
            solve.result_id, solve.attempt_number
        ) AS position,
        COUNT(*) OVER () AS total_count
      FROM result_rankings_single solve
      WHERE ${conditions.join(" AND ")}
    ), page AS (
      SELECT * FROM scoped WHERE position > ? ORDER BY position LIMIT ?
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    ORDER BY page.position`;
}

export function genderRankingPageQuery(input: GenderRankingQueryInput) {
  return sqlFragment`WITH filtered AS (
    SELECT ranking.*,
      RANK() OVER (ORDER BY ranking.best) AS filtered_rank,
      ROW_NUMBER() OVER (ORDER BY ranking.best, ranking.person_name, ranking.person_id) AS filtered_position,
      COUNT(*) OVER () AS total_count
    FROM ${input.source} ranking
    WHERE ${input.baseConditions.join(" AND ")}
  ) SELECT ${input.selectColumns}, total_count
    FROM filtered ${input.conditions.length ? `WHERE ${input.conditions.join(" AND ")}` : ""}
    ORDER BY filtered_position LIMIT ?`;
}

export function genderPersonRankingRowsQuery({
  genderCount,
  recordColumn,
  positionColumn,
  regionColumn,
}: {
  genderCount: number;
  recordColumn: string;
  positionColumn: string;
  regionColumn: string | null;
}) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  const regionCondition = regionColumn
    ? ` AND ranking.${regionColumn} = ?`
    : "";
  return sqlFragment`WITH page AS (
      SELECT ranking.person_id, ranking.result_id, ranking.result_value,
        ranking.country_id, ranking.continent_id, ranking.world_rank,
        ranking.${positionColumn} AS page_position
      FROM person_event_rankings ranking
      WHERE ranking.event_id = ? AND ranking.result_type = ?
        AND ranking.gender IN (${genderPlaceholders})${regionCondition}
      ORDER BY ranking.${positionColumn}, ranking.person_id
      LIMIT ? OFFSET ?
    )
    SELECT page.person_id, page.result_id, page.result_value,
      page.country_id, page.continent_id, page.world_rank,
      COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(facts.competition_id, '') AS competition_id,
      COALESCE(competition.name, '') AS competition_name,
      ${recordColumn} = 'WR' AS is_world_record,
      ${recordColumn} IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      ${recordColumn} = 'NR' AS is_country_record
    FROM page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN result_facts facts ON facts.result_id = page.result_id
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = facts.competition_id
    ORDER BY page.page_position, page.person_id`;
}

export function genderPersonRankingCountQuery(
  genderCount: number,
  regionColumn: string | null,
) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  return sqlFragment`SELECT COUNT(*) AS count
    FROM person_event_rankings ranking
    WHERE ranking.event_id = ? AND ranking.result_type = ?
      AND ranking.gender IN (${genderPlaceholders})${regionColumn ? ` AND ranking.${regionColumn} = ?` : ""}`;
}

export function genderPersonRankingPrefixCountQuery(
  genderCount: number,
  regionColumn: string | null,
) {
  const genderPlaceholders = Array.from(
    { length: genderCount },
    () => "?",
  ).join(", ");
  return sqlFragment`SELECT COUNT(*) AS count
    FROM person_event_rankings ranking
    WHERE ranking.event_id = ? AND ranking.result_type = ?
      AND ranking.gender IN (${genderPlaceholders})
      AND ranking.result_value < ?${regionColumn ? ` AND ranking.${regionColumn} = ?` : ""}`;
}

export function yearlyRankingPageQuery(
  table: string,
  columns: string,
  conditions: string[],
) {
  return sqlFragment`SELECT ${columns}
      FROM ${table} ranking
      LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
      LEFT JOIN countries country ON country.id = facts.person_country_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
      WHERE ${conditions.join(" AND ")} AND ranking.position >= ? AND ranking.position < ?
      ORDER BY ranking.position`;
}

export function filteredYearlyRankingPageQuery(
  table: string,
  conditions: string[],
) {
  return sqlFragment`WITH candidates AS (
      SELECT ranking.person_id, ranking.result_id, ranking.result_value,
        COALESCE(person.name, ranking.person_id) AS person_name,
        COALESCE(country.id, '') AS country_id, COALESCE(country.name, country.id, '') AS country_name,
        COALESCE(country.iso2, '') AS country_iso2, COALESCE(country.continent_id, '') AS continent_id,
        COALESCE(facts.competition_id, '') AS competition_id,
        COALESCE(competition.name, '') AS competition_name,
        facts.competition_start_date,
        COALESCE(facts.round_type_id, '') AS round_type_id,
        facts.regional_single_record,
        facts.regional_average_record
      FROM ${table} ranking
      JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
      LEFT JOIN countries country ON country.id = facts.person_country_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
      WHERE ${conditions.join(" AND ")}
    ), ranked AS (
      SELECT candidates.*,
        RANK() OVER (ORDER BY result_value) AS rank,
        ROW_NUMBER() OVER (ORDER BY result_value, person_id) AS sub_rank,
        COUNT(*) OVER () AS total_count
      FROM candidates
    )
    SELECT rank, sub_rank, total_count, person_id, person_name, country_id, country_name,
      country_iso2, continent_id, result_value AS best, competition_id, competition_name,
      regional_single_record = 'WR' OR regional_average_record = 'WR' AS is_world_record,
      regional_single_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR')
        OR regional_average_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      regional_single_record = 'NR' OR regional_average_record = 'NR' AS is_country_record,
      NULL AS world_rank_delta, NULL AS world_rank_delta_state,
      NULL AS continent_rank_delta, NULL AS continent_rank_delta_state,
      NULL AS country_rank_delta, NULL AS country_rank_delta_state,
      NULL AS record_streak_weeks
    FROM ranked
    WHERE sub_rank >= ? AND sub_rank < ?
    ORDER BY sub_rank`;
}

export function filteredResultRankingsQuery({
  source,
  joins = "",
  candidateColumns,
  conditions,
}: {
  source: string;
  joins?: string;
  candidateColumns: string;
  conditions: string[];
}) {
  return sqlFragment`WITH candidates AS (
      SELECT ${candidateColumns}
      FROM ${source}
      ${joins}
      WHERE ${conditions.join(" AND ")}
    ), ranked AS (
      SELECT candidates.*,
        RANK() OVER (ORDER BY result_value) AS rank,
        ROW_NUMBER() OVER (
          ORDER BY result_value, competition_start_date, competition_id, result_id,
            COALESCE(attempt_number, 0)
        ) AS position,
        COUNT(*) OVER () AS total_count
      FROM candidates
    )
    SELECT page.*, COALESCE(person.name, page.person_id) AS person_name,
      COALESCE(country.name, page.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, page.competition_id) AS competition_name
    FROM ranked page
    LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = page.country_id
    LEFT JOIN competitions competition ON competition.id = page.competition_id
    WHERE page.position > ?
    ORDER BY page.position
    LIMIT ?`;
}

export function rankingPageQuery(
  table: string,
  columns: string,
  conditions: string[],
  subRank: string,
) {
  return sqlFragment`SELECT ${columns} FROM ${table} WHERE ${conditions.join(" AND ")} AND ${subRank} >= ? AND ${subRank} < ? ORDER BY ${subRank}`;
}

export function rankingLocateQuery(input: RankingPageQueryInput) {
  return sqlFragment`SELECT ${input.selectColumns} ${input.from} WHERE ${input.predicate} AND ${input.personColumn} = ? LIMIT 1`;
}

export function rankingSearchQuery(input: RankingSearchQueryInput) {
  const placeholders = input.personIds.map(() => "?").join(", ");
  return sqlFragment`SELECT ${input.selectColumns} ${input.from} WHERE ${input.predicate} AND ${input.personColumn} IN (${placeholders}) ORDER BY ${input.qualifiedSubRank} LIMIT ?`;
}

export function rankingCursorQuery(input: RankingCursorQueryInput) {
  return sqlFragment`SELECT ${input.selectColumns} ${input.from} WHERE ${input.predicate}${input.cursor} ORDER BY ${input.qualifiedSubRank} LIMIT ?`;
}

export function personMetricQuery(input: PersonMetricQueryInput) {
  return sqlFragment`SELECT score.${input.rankColumn} AS rank, score.${input.positionColumn} AS sub_rank, score.person_id,
       COALESCE(person.name, score.person_id) AS person_name,
       COALESCE(display_country.id, '') AS country_id,
       COALESCE(display_country.name, display_country.id, '') AS country_name,
       COALESCE(display_country.iso2, '') AS country_iso2,
       COALESCE(display_country.continent_id, '') AS continent_id,
       ${input.scoreExpression} AS best
     FROM person_sum_of_ranks_scores score
     LEFT JOIN persons person ON person.wca_id = score.person_id AND person.sub_id = 1
     LEFT JOIN countries current_country ON current_country.id = person.country_id
     LEFT JOIN countries display_country ON display_country.id = CASE
       WHEN ? = 'country' THEN ?
       WHEN ? = 'continent' AND current_country.continent_id <> ? THEN NULL
       ELSE person.country_id
     END
     WHERE ${input.conditions.join(" AND ")}
     ORDER BY score.${input.positionColumn}, score.person_id
     LIMIT ?`;
}

export function personMetricEndQuery(positionColumn: string) {
  return sqlFragment`SELECT ${positionColumn} AS position
     FROM person_sum_of_ranks_scores
     WHERE metric_version = 1 AND event_set_version = 1
       AND result_type = ? AND scope = ? AND region_id = ?
       AND ${positionColumn} IS NOT NULL
     ORDER BY ${positionColumn} DESC
     LIMIT 1`;
}

export function filteredPersonMetricQuery(
  input: FilteredPersonMetricQueryInput,
) {
  return sqlFragment`WITH filtered AS (
       SELECT score.person_id, ${input.scoreValue} AS best,
         DENSE_RANK() OVER (ORDER BY ${input.scoreOrder}) AS filtered_rank,
         ROW_NUMBER() OVER (ORDER BY ${input.scoreOrder}, score.person_id) AS filtered_position,
         COUNT(*) OVER () AS total_count
       FROM person_sum_of_ranks_scores score
       WHERE ${input.conditions.join(" AND ")}
     ), page AS (
       SELECT * FROM filtered
       WHERE ${input.pageConditions.join(" AND ")}
       ORDER BY filtered_position
       LIMIT ?
     )
     SELECT page.filtered_rank AS rank, page.filtered_position AS sub_rank, page.total_count,
       page.person_id, COALESCE(person.name, page.person_id) AS person_name,
       COALESCE(display_country.id, '') AS country_id,
       COALESCE(display_country.name, display_country.id, '') AS country_name,
       COALESCE(display_country.iso2, '') AS country_iso2,
       COALESCE(display_country.continent_id, '') AS continent_id,
       page.best
     FROM page
     LEFT JOIN persons person ON person.wca_id = page.person_id AND person.sub_id = 1
     LEFT JOIN countries current_country ON current_country.id = person.country_id
     LEFT JOIN countries display_country ON display_country.id = CASE
       WHEN ? = 'country' THEN ?
       WHEN ? = 'continent' AND current_country.continent_id <> ? THEN NULL
       ELSE person.country_id
     END
     ORDER BY page.filtered_position`;
}
