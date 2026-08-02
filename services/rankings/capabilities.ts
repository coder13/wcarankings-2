import { query } from "@/db";

import type { RankingEntryEnhancements } from "@/services/rankings/helpers";

const RANKING_ENTRY_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
] as const;
const RANKING_ENTRY_ENHANCEMENT_COLUMNS = [
  "world_rank_delta",
  "world_rank_delta_state",
  "continent_rank_delta",
  "continent_rank_delta_state",
  "country_rank_delta",
  "country_rank_delta_state",
  "record_streak_weeks",
] as const;

type ColumnRow = { table_name: string; column_name: string };

let cached: { value: RankingEntryEnhancements; expiresAt: number } | null = null;
let loading: Promise<RankingEntryEnhancements> | null = null;
const CACHE_TTL_MS = 5_000;

export function rankingEntryEnhancementsFromColumns(
  columns: Iterable<Pick<ColumnRow, "table_name" | "column_name">>,
): RankingEntryEnhancements {
  const present = new Set(
    [...columns].map(({ table_name, column_name }) => `${table_name}:${column_name}`),
  );
  return {
    rankDeltas: RANKING_ENTRY_TABLES.every((table) =>
      RANKING_ENTRY_ENHANCEMENT_COLUMNS.every((column) => present.has(`${table}:${column}`))),
  };
}

async function loadRankingEntryEnhancements() {
  try {
    const result = await query<ColumnRow>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name IN (?, ?)
          AND column_name IN (${RANKING_ENTRY_ENHANCEMENT_COLUMNS.map(() => "?").join(", ")})`,
      [...RANKING_ENTRY_TABLES, ...RANKING_ENTRY_ENHANCEMENT_COLUMNS],
    );
    return rankingEntryEnhancementsFromColumns(result.rows);
  } catch {
    // A failed capability probe must not turn a compatible deployment into an
    // outage. The next short-lived cache refresh will retry the probe.
    return { rankDeltas: false };
  }
}

// Compatibility tables are activated independently from server images. Probe
// their actual schema rather than assuming the current server's columns have
// already reached production.
export async function getRankingEntryEnhancements() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (!loading) {
    loading = loadRankingEntryEnhancements()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export function resetRankingEntryEnhancementsForTests() {
  cached = null;
  loading = null;
}
