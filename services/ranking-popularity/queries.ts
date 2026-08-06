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
