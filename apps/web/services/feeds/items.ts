import { query as defaultQuery } from "@/db";
import type { FeedUserPreferences } from "./preferences";
import type { FeedInterestingResult } from "./stat-previews";
import { currentFeedExportVersion } from "./snapshot";
import { rankingListKeyForFeedStat } from "./sort";
import { FEED_SORT_CONSTANTS } from "./constants";

type FeedQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateDaysBefore(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

function rowToFeedItem(row: Record<string, unknown>): FeedInterestingResult {
  const gender = row.gender === "f" || row.gender === "o" ? row.gender : null;
  const scope = String(row.region_scope) as "world" | "continent" | "country";
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    eventName: String(row.event_name),
    resultType: String(row.result_type) as "single" | "average",
    kind: String(row.stat_kind) as FeedInterestingResult["kind"],
    region: {
      scope,
      regionId: String(row.region_id ?? ""),
      name: String(row.region_id ?? ""),
    },
    gender,
    year: row.stat_year === null ? null : (Number(row.stat_year) as 2026),
    title: String(row.title),
    exploreUrl: String(row.explore_url),
    interestingEntityId: String(row.interesting_entity_id),
    interestingResultId: Number(row.interesting_result_id),
    worldRank: number(row.world_rank),
    continentRank: number(row.continent_rank),
    countryRank: number(row.country_rank),
  };
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export async function readFeedItems({
  cursor,
  limit,
  now = new Date(),
  preferences = null,
  query = defaultQuery,
}: {
  cursor: number;
  limit: number;
  now?: Date;
  preferences?: FeedUserPreferences | null;
  query?: FeedQuery;
}) {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("The feed cursor must be a non-negative integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("The feed limit must be from 1 to 100.");
  }
  const exportVersion = await currentFeedExportVersion(query);
  const countryIds = preferences?.preferredCountryIds ?? [];
  const continentIds = preferences?.preferredContinentIds ?? [];
  const countryList = countryIds.length ? countryIds : [""];
  const continentList = continentIds.length ? continentIds : [""];
  const values: unknown[] = [
    dateDaysBefore(now, 6),
    dateDaysBefore(now, 29),
    exportVersion,
    preferences?.countryId ?? "",
    preferences?.continentId ?? "",
    ...countryList,
    ...countryList,
    ...continentList,
    ...continentList,
    limit,
    cursor,
  ];
  const result = await query(
    `SELECT feed.id, feed.interesting_result_id, feed.interesting_entity_id,
       feed.event_id, feed.event_name, feed.result_type,
       feed.stat_kind, feed.region_scope, feed.region_id, feed.gender,
       feed.stat_year, feed.title, feed.explore_url, feed.world_rank,
       feed.continent_rank, feed.country_rank
     FROM feed_items feed
     LEFT JOIN (
       SELECT ranking_list_key,
          SUM(CASE WHEN popularity_date >= ? THEN successful_first_page_view_count ELSE 0 END) AS seven_day_views,
          SUM(successful_first_page_view_count) AS thirty_day_views
       FROM ranking_list_daily_popularity
       WHERE popularity_date >= ?
       GROUP BY ranking_list_key
     ) popularity ON popularity.ranking_list_key = feed.ranking_list_key
     WHERE feed.export_version = ?
     ORDER BY
       CASE
         WHEN feed.region_scope = 'country' AND feed.region_id = ? THEN 160
         WHEN feed.region_scope = 'continent' AND feed.region_id = ? THEN 90
         WHEN feed.region_scope = 'country' AND feed.region_id IN (${placeholders(countryList.length)})
           THEN 80 / (1 + FIELD(feed.region_id, ${placeholders(countryList.length)}))
         WHEN feed.region_scope = 'continent' AND feed.region_id IN (${placeholders(continentList.length)})
           THEN 45 / (1 + FIELD(feed.region_id, ${placeholders(continentList.length)}))
         ELSE 0
       END DESC,
       CASE WHEN feed.result_type = 'average' THEN 25 ELSE 0 END DESC,
       CASE feed.region_scope
         WHEN 'world' THEN 300 + CASE WHEN feed.world_rank BETWEEN 1 AND 10 THEN 110 - feed.world_rank * 10 ELSE 0 END
       WHEN 'continent' THEN 200 + CASE WHEN feed.continent_rank BETWEEN 1 AND 10 THEN 110 - feed.continent_rank * 10 ELSE 0 END
         ELSE 100 + CASE WHEN feed.country_rank BETWEEN 1 AND 10 THEN 110 - feed.country_rank * 10 ELSE 0 END
       END DESC,
       CASE
         WHEN feed.stat_kind IN ('person', 'person-competition', 'person-medals')
           THEN ${FEED_SORT_CONSTANTS.personRankingWeight}
         WHEN feed.stat_kind = 'result' AND feed.stat_year IS NULL
           THEN ${FEED_SORT_CONSTANTS.allTimePersonResultWeight}
         WHEN feed.stat_kind = 'result'
           THEN ${FEED_SORT_CONSTANTS.currentYearPersonResultWeight}
         WHEN feed.stat_kind = 'competition'
           THEN ${FEED_SORT_CONSTANTS.competitionWeight}
         ELSE ${FEED_SORT_CONSTANTS.cityWeight}
       END DESC,
       GREATEST(
         0,
         LEAST(
           COUNT(*) OVER (
             PARTITION BY feed.event_id, feed.result_type, feed.stat_kind,
               feed.region_scope, feed.region_id, feed.gender, feed.stat_year
           ),
           ${FEED_SORT_CONSTANTS.maxSameStatResultBoost + 1}
         ) - 1
       ) * ${FEED_SORT_CONSTANTS.sameStatResultWeight} DESC,
       (LOG2(1 + COALESCE(popularity.seven_day_views, 0))
         + 0.25 * LOG2(1 + COALESCE(popularity.thirty_day_views, 0))) DESC,
       feed.id ASC
     LIMIT ? OFFSET ?`,
    values,
  );
  return result.rows.map(rowToFeedItem);
}

function rowValues(candidate: FeedInterestingResult, exportVersion: string) {
  return [
    exportVersion,
    candidate.interestingResultId,
    candidate.interestingEntityId,
    candidate.eventId,
    candidate.eventName,
    candidate.resultType,
    candidate.kind,
    candidate.region.scope,
    candidate.region.regionId,
    candidate.gender,
    candidate.year,
    candidate.title,
    candidate.exploreUrl,
    candidate.worldRank,
    candidate.continentRank,
    candidate.countryRank,
    rankingListKeyForFeedStat(candidate),
  ];
}

export async function replaceFeedItems(
  candidates: readonly FeedInterestingResult[],
  options: { query?: FeedQuery; exportVersion: string },
) {
  const query = options.query ?? defaultQuery;
  await query("DELETE FROM feed_items");
  const columns = 17;
  for (let start = 0; start < candidates.length; start += 250) {
    const batch = candidates
      .slice(start, start + 250)
      .filter((candidate) => candidate.interestingResultId !== undefined);
    if (!batch.length) continue;
    await query(
      `INSERT INTO feed_items (
        export_version, interesting_result_id, interesting_entity_id,
        event_id, event_name, result_type, stat_kind, region_scope, region_id, gender,
        stat_year, title, explore_url, world_rank, continent_rank,
        country_rank, ranking_list_key
      ) VALUES ${batch.map(() => `(${placeholders(columns)})`).join(", ")}
      ON DUPLICATE KEY UPDATE
        interesting_entity_id = VALUES(interesting_entity_id),
        title = VALUES(title), explore_url = VALUES(explore_url),
        world_rank = VALUES(world_rank), continent_rank = VALUES(continent_rank),
        country_rank = VALUES(country_rank), ranking_list_key = VALUES(ranking_list_key)`,
      batch.flatMap((candidate) => rowValues(candidate, options.exportVersion)),
    );
  }
}
