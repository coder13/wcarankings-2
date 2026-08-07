import { escapeSqlIdentifier, sqlFragment } from "@/lib/helpers/database/sql";
import type {
  CompetitionEntityQueryInput,
  LatitudeQueryInput,
  PodiumEntityQueryInput,
} from "@/services/rankings/types";

export function competitorCountRowsQuery() {
  return sqlFragment`
    WITH
      page AS (
        SELECT
          stats.competition_id,
          stats.competitor_count,
          stats.competitor_count_rank AS rank,
          stats.competitor_count_position AS position
        FROM
          competition_stats stats
        WHERE
          stats.competitor_count_position > ?
        ORDER BY
          stats.competitor_count_position
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.venue, '') AS venue,
      COALESCE(competition.city_name, '') AS city_name,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2
    FROM
      page
      LEFT JOIN competitions competition ON competition.id = page.competition_id
      LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY
      page.position
  `;
}

export function competitorCountTotalQuery() {
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      competition_stats
    WHERE
      competitor_count_position IS NOT NULL
  `;
}

export function latitudeRowsQuery(input: LatitudeQueryInput) {
  return input.scoped
    ? sqlFragment`
        WITH
          scoped AS (
            SELECT
              stats.competition_id,
              stats.start_date,
              stats.latitude,
              COALESCE(competition.name, stats.competition_id) AS competition_name,
              COALESCE(competition.venue, '') AS venue,
              COALESCE(competition.city_name, '') AS city_name,
              COALESCE(country.name, competition.country_id, '') AS country_name,
              COALESCE(country.iso2, '') AS country_iso2
            FROM
              competition_stats stats
              JOIN competitions competition ON competition.id = stats.competition_id
              JOIN countries country ON country.id = competition.country_id
            WHERE
              stats.${input.prefix}_position IS NOT NULL
              AND ${input.regionColumn} = ?
          ),
          ranked AS (
            SELECT
              scoped.*,
              DENSE_RANK() OVER (
                ORDER BY
                  latitude ${input.direction}
              ) AS rank,
              ROW_NUMBER() OVER (
                ORDER BY
                  latitude ${input.direction},
                  start_date,
                  competition_id
              ) AS position
            FROM
              scoped
          )
        SELECT
          *
        FROM
          ranked
        WHERE
          position > ?
        ORDER BY
          position
        LIMIT
          ?
      `
    : sqlFragment`
        WITH
          page AS (
            SELECT
              stats.competition_id,
              stats.latitude,
              stats.${input.prefix}_rank AS rank,
              stats.${input.prefix}_position AS position
            FROM
              competition_stats stats
            WHERE
              stats.${input.prefix}_position > ?
            ORDER BY
              stats.${input.prefix}_position
            LIMIT
              ?
          )
        SELECT
          page.*,
          COALESCE(competition.name, page.competition_id) AS competition_name,
          COALESCE(competition.venue, '') AS venue,
          COALESCE(competition.city_name, '') AS city_name,
          COALESCE(country.name, competition.country_id, '') AS country_name,
          COALESCE(country.iso2, '') AS country_iso2
        FROM
          page
          LEFT JOIN competitions competition ON competition.id = page.competition_id
          LEFT JOIN countries country ON country.id = competition.country_id
        ORDER BY
          page.position
      `;
}

export function latitudeCountQuery(input: LatitudeQueryInput) {
  return input.scoped
    ? sqlFragment`
        SELECT
          COUNT(*) AS count
        FROM
          competition_stats stats
          JOIN competitions competition ON competition.id = stats.competition_id
          JOIN countries country ON country.id = competition.country_id
        WHERE
          stats.${input.prefix}_position IS NOT NULL
          AND ${input.regionColumn} = ?
      `
    : sqlFragment`
        SELECT
          COUNT(*) AS count
        FROM
          competition_stats
        WHERE
          ${input.prefix}_position IS NOT NULL
      `;
}

export function competitionEntityRowsQuery(input: CompetitionEntityQueryInput) {
  const valueColumn = escapeSqlIdentifier(input.valueColumn);
  const resultIdColumn = escapeSqlIdentifier(input.resultIdColumn);
  const rankColumn = escapeSqlIdentifier(input.rankColumn);
  const positionColumn = escapeSqlIdentifier(input.positionColumn);
  return sqlFragment`
    WITH
      page AS (
        SELECT
          stats.competition_id,
          stats.start_date,
          stats.${valueColumn} AS result_value,
          stats.${resultIdColumn} AS result_id,
          stats.${rankColumn} AS rank,
          stats.${positionColumn} AS position
        FROM
          competition_event_stats stats
        WHERE
          stats.event_id = ?
          AND stats.${positionColumn} > ?
        ORDER BY
          stats.${positionColumn}
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      result.person_id,
      COALESCE(person.name, result.person_id) AS person_name
    FROM
      page
      INNER JOIN results result ON result.id = page.result_id
      LEFT JOIN persons person ON person.wca_id = result.person_id
      AND person.sub_id = 1
      LEFT JOIN competitions competition ON competition.id = page.competition_id
      LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY
      page.position
  `;
}

export function competitionEntityCountQuery(
  input: CompetitionEntityQueryInput,
) {
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      competition_event_stats
    WHERE
      event_id = ?
      AND ${escapeSqlIdentifier(input.positionColumn)} IS NOT NULL
  `;
}

export function podiumEntityRowsQuery(input: PodiumEntityQueryInput) {
  const positionColumn = escapeSqlIdentifier(input.positionColumn);
  return sqlFragment`
    WITH
      page AS (
        SELECT
          stats.competition_id,
          stats.start_date,
          stats.podium_score AS score,
          stats.podium_rank AS rank,
          stats.${positionColumn} AS position
        FROM
          competition_event_stats stats
        WHERE
          stats.event_id = ?
          AND stats.${positionColumn} > ?
        ORDER BY
          stats.${positionColumn}
        LIMIT
          ?
      )
    SELECT
      page.*,
      COALESCE(competition.name, page.competition_id) AS competition_name,
      COALESCE(competition.country_id, '') AS country_id,
      COALESCE(country.name, competition.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      member.podium_position,
      member.person_id AS member_person_id,
      COALESCE(person.name, member.person_id) AS member_person_name,
      member.result_id AS member_result_id,
      member.result_value AS member_result_value
    FROM
      page
      INNER JOIN competition_podium_members member ON member.competition_id = page.competition_id
      AND member.event_id = ?
      AND member.result_type = ?
      LEFT JOIN persons person ON person.wca_id = member.person_id
      AND person.sub_id = 1
      LEFT JOIN competitions competition ON competition.id = page.competition_id
      LEFT JOIN countries country ON country.id = competition.country_id
    ORDER BY
      page.position,
      member.podium_position,
      member.result_id
  `;
}

export function podiumEntityCountQuery(input: PodiumEntityQueryInput) {
  return sqlFragment`
    SELECT
      COUNT(*) AS count
    FROM
      competition_event_stats
    WHERE
      event_id = ?
      AND ${escapeSqlIdentifier(input.positionColumn)} IS NOT NULL
  `;
}
