import { sqlFragment } from "@/lib/helpers/database/sql";

export function upsertRankingListDescriptorQuery() {
  return sqlFragment`
    INSERT INTO
      ranking_list_descriptors (
        ranking_list_key,
        source_family,
        canonical_descriptor_json,
        custom_list_public_id,
        first_seen_at,
        last_seen_at
      )
    VALUES
      (?, ?, ?, ?, CURRENT_TIMESTAMP (6), CURRENT_TIMESTAMP (6))
    ON DUPLICATE KEY UPDATE
      source_family = VALUES(source_family),
      canonical_descriptor_json = VALUES(canonical_descriptor_json),
      custom_list_public_id = VALUES(custom_list_public_id),
      last_seen_at = CURRENT_TIMESTAMP (6)
  `;
}

export function upsertDailyPopularityQuery(count: number) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("The daily popularity upsert requires at least one row.");
  }
  return sqlFragment`
    INSERT INTO
      ranking_list_daily_popularity (
        ranking_list_key,
        popularity_date,
        successful_first_page_view_count
      )
    VALUES
      ${Array.from({ length: count }, () => "(?, ?, ?)").join(",")}
    ON DUPLICATE KEY UPDATE
      successful_first_page_view_count = successful_first_page_view_count + VALUES(successful_first_page_view_count)
  `;
}

export function rankingPopularityTotalsQuery() {
  return sqlFragment`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN popularity_date >= ? THEN successful_first_page_view_count
            ELSE 0
          END
        ),
        0
      ) AS seven_day_views,
      COALESCE(SUM(successful_first_page_view_count), 0) AS thirty_day_views
    FROM
      ranking_list_daily_popularity
    WHERE
      ranking_list_key = ?
      AND popularity_date >= ?
  `;
}

export function popularRankingDescriptorsQuery() {
  return sqlFragment`
    SELECT
      popularity.ranking_list_key,
      popularity.source_family,
      popularity.canonical_descriptor_json,
      popularity.custom_list_public_id,
      popularity.first_seen_at,
      popularity.last_seen_at,
      popularity.seven_day_views,
      popularity.thirty_day_views
    FROM (
      SELECT
        descriptors.ranking_list_key,
        descriptors.source_family,
        descriptors.canonical_descriptor_json,
        descriptors.custom_list_public_id,
        descriptors.first_seen_at,
        descriptors.last_seen_at,
        COALESCE(
          SUM(
            CASE
              WHEN daily.popularity_date >= ? THEN daily.successful_first_page_view_count
              ELSE 0
            END
          ),
          0
        ) AS seven_day_views,
        COALESCE(SUM(daily.successful_first_page_view_count), 0) AS thirty_day_views
      FROM ranking_list_descriptors descriptors
      LEFT JOIN ranking_list_daily_popularity daily
        ON daily.ranking_list_key = descriptors.ranking_list_key
        AND daily.popularity_date >= ?
      GROUP BY
        descriptors.ranking_list_key,
        descriptors.source_family,
        descriptors.canonical_descriptor_json,
        descriptors.custom_list_public_id,
        descriptors.first_seen_at,
        descriptors.last_seen_at
    ) popularity
    WHERE popularity.thirty_day_views > 0
    ORDER BY
      (
        LOG2(1 + popularity.seven_day_views) +
        0.25 * LOG2(1 + popularity.thirty_day_views)
      ) DESC,
      popularity.seven_day_views DESC,
      popularity.thirty_day_views DESC,
      popularity.ranking_list_key ASC
    LIMIT ?
  `;
}
