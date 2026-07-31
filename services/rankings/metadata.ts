import { query } from "@/db";
import type { RankingType, RegionScope } from "@/lib/wca";
import { RANKINGS_CACHE_REFRESH_MS, rankingsPageCache } from "@/services/rankings/cache";
import { countKey, yearCountKey } from "@/services/rankings/helpers";
import {
  rankingCountsQuery,
  rankingMetadataQuery,
  rankingVersionQuery,
  requiredRankingColumnsQuery,
  requiredRankingIndexesQuery,
  requiredRankingTablesQuery,
  yearCountsQuery,
} from "@/services/rankings/queries";
import type {
  CountRow,
  MetadataRow,
  RankingsMetadata,
  YearCountRow,
} from "@/services/rankings/types";

let snapshot: RankingsMetadata | null = null;
let loading: Promise<RankingsMetadata> | null = null;
let refreshing: Promise<RankingsMetadata> | null = null;
let lastVersionCheck = 0;
let readiness: Promise<void> | null = null;

async function loadYearCounts() {
  try {
    const result = await query<YearCountRow>(yearCountsQuery());
    return { rows: result.rows, available: true };
  } catch (error) {
    // Deploying the application before a targeted yearly backfill must not
    // interrupt existing all-time rankings. A year request remains a clear
    // unavailable-year response until these projections are published.
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return { rows: [] as YearCountRow[], available: false };
    }
    throw error;
  }
}

async function loadSnapshot() {
  const [counts, yearCounts, metadata] = await Promise.all([
    query<CountRow>(rankingCountsQuery()),
    loadYearCounts(),
    query<MetadataRow>(rankingMetadataQuery()),
  ]);
  const values = new Map(metadata.rows.map((row) => [row.key, row.value]));
  const fetchedAt = values.get("fetched_at");
  if (!fetchedAt) throw new Error("Ranking metadata is missing fetched_at.");
  return {
    fetchedAt,
    exportDate: values.get("export_date") ?? null,
    counts: new Map(
      counts.rows.map((row) => [
        countKey(row.event_id, row.ranking_type, row.scope, row.region_id),
        Number(row.count),
      ]),
    ),
    yearCounts: new Map(
      yearCounts.rows.map((row) => [
        yearCountKey(Number(row.year), row.event_id, row.ranking_type, row.scope, row.region_id),
        Number(row.count),
      ]),
    ),
    availableYears: [...new Set(yearCounts.rows.map((row) => Number(row.year)))].sort(
      (left, right) => right - left,
    ),
    yearProjectionAvailable: yearCounts.available,
  };
}

export async function getRankingsMetadata() {
  if (snapshot) return snapshot;
  if (!loading)
    loading = loadSnapshot()
      .then((next) => {
        snapshot = next;
        lastVersionCheck = Date.now();
        return next;
      })
      .finally(() => {
        loading = null;
      });
  return loading;
}

export async function refreshRankingsMetadata() {
  const now = Date.now();
  if (!snapshot || now - lastVersionCheck >= RANKINGS_CACHE_REFRESH_MS) {
    lastVersionCheck = now;
    if (!refreshing) {
      refreshing = (async () => {
        const version = await query<{ value: string }>(rankingVersionQuery());
        const fetchedAt = version.rows[0]?.value;
        if (!fetchedAt) throw new Error("Ranking metadata is missing fetched_at.");
        if (!snapshot || fetchedAt !== snapshot.fetchedAt || !snapshot.yearProjectionAvailable) {
          const next = await loadSnapshot();
          snapshot = next;
          rankingsPageCache.clear();
          readiness = null;
        }
        return snapshot;
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }
  return snapshot;
}

export async function getCurrentRankingsMetadata() {
  await getRankingsMetadata();
  return refreshRankingsMetadata();
}

export function getRankingCount(
  metadata: RankingsMetadata,
  eventId: string,
  type: RankingType,
  scope: RegionScope,
  regionId: string,
) {
  const count = metadata.counts.get(countKey(eventId, type, scope, regionId));
  if (count === undefined) throw new Error("Ranking count metadata is missing for this cohort.");
  return count;
}

export function getYearRankingCount(
  metadata: RankingsMetadata,
  year: number,
  eventId: string,
  type: RankingType,
  scope: RegionScope,
  regionId: string,
) {
  return metadata.yearCounts.get(yearCountKey(year, eventId, type, scope, regionId)) ?? 0;
}

export async function assertRankingsReady() {
  if (!readiness)
    readiness = (async () => {
      // Yearly projections are published by their own targeted backfill. Keep
      // all-time rankings ready while an older deployment has not received that
      // optional projection group yet; yearly requests report an unavailable
      // year until it is present.
      const tables = ["ranking_entries_single", "ranking_entries_average"];
      const columns = [
        "event_id",
        "world_rank",
        "world_sub_rank",
        "continent_id",
        "continent_rank",
        "continent_sub_rank",
        "country_id",
        "country_rank",
        "country_sub_rank",
      ];
      const indexes = [
        "idx_ranking_entries_world",
        "idx_ranking_entries_continent",
        "idx_ranking_entries_country",
      ];
      const [tableRows, columnRows, indexRows] = await Promise.all([
        query<{ name: string }>(requiredRankingTablesQuery(tables), tables),
        query<{ table_name: string; column_name: string }>(
          requiredRankingColumnsQuery(tables, columns),
          [...tables, ...columns],
        ),
        query<{ table_name: string; index_name: string }>(
          requiredRankingIndexesQuery(tables, indexes),
          [...tables, ...indexes],
        ),
      ]);
      for (const table of tables) {
        if (!tableRows.rows.some((row) => row.name === table))
          throw new Error(`Required projection ${table} is missing.`);
        for (const column of columns)
          if (
            !columnRows.rows.some((row) => row.table_name === table && row.column_name === column)
          )
            throw new Error(`Required projection column ${table}.${column} is missing.`);
        for (const index of indexes)
          if (!indexRows.rows.some((row) => row.table_name === table && row.index_name === index))
            throw new Error(`Required projection index ${table}.${index} is missing.`);
      }
      await getRankingsMetadata();
    })().catch((error) => {
      readiness = null;
      throw error;
    });
  return readiness;
}

export function resetRankingsMetadataForTests() {
  snapshot = null;
  loading = null;
  refreshing = null;
  readiness = null;
  lastVersionCheck = 0;
}
