import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { getRegions } from "@/services/regions/service";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import { buildFeedStatInventory, type FeedInventoryStat } from "./inventory";
import { discoverRecentCompetitionTriggers } from "./recent-changes";

const PAGE_SIZE = 5;
const MAX_SOURCE_SCAN = PAGE_SIZE;
const SOURCE_READ_CONCURRENCY = 2;

export type FeedStatPreview = FeedInventoryStat & { entries: RankingEntry[] };

export type FeedStatPreviewPage = {
  previews: FeedStatPreview[];
  nextCursor: number | null;
};

function sourceParams(source: FeedInventoryStat) {
  const params = new URLSearchParams({
    eventId: source.eventId,
    result: source.resultType,
    start: source.kind === "person" ? "1" : "0",
    limit: "20",
  });
  if (source.region.scope !== "world") {
    params.set("region", source.region.regionId);
  }
  if (source.gender !== null) params.set("gender", source.gender);
  if (source.year !== null) params.set("year", String(source.year));
  return params;
}

async function sourceEntries(source: FeedInventoryStat) {
  try {
    const params = sourceParams(source);
    if (source.kind === "person") {
      const result = await loadRankingsWithDiagnostics(params);
      return result.data.entries ?? [];
    }
    const result = await loadResultRankings(params);
    return result.data.entries ?? [];
  } catch {
    return [];
  }
}

async function loadSourcePage(sourcePage: readonly FeedInventoryStat[]) {
  const loaded: Array<{ source: FeedInventoryStat; entries: RankingEntry[] }> =
    [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < sourcePage.length) {
      const index = nextIndex++;
      const source = sourcePage[index];
      if (!source) continue;
      loaded[index] = { source, entries: await sourceEntries(source) };
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(SOURCE_READ_CONCURRENCY, sourcePage.length) },
      () => worker(),
    ),
  );
  return loaded.filter(
    (item): item is { source: FeedInventoryStat; entries: RankingEntry[] } =>
      item !== undefined,
  );
}

export async function loadFeedStatPreviews({
  cursor = 0,
  now,
}: {
  cursor?: number;
  now?: Date;
} = {}): Promise<FeedStatPreviewPage> {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("The feed cursor must be a non-negative integer.");
  }
  const [{ triggers }, continents, countries] = await Promise.all([
    discoverRecentCompetitionTriggers({ now }),
    getRegions("continent"),
    getRegions("country"),
  ]);
  const inventory = buildFeedStatInventory({ continents, countries });
  const competitionIds = new Set(
    triggers.map((trigger) => trigger.competitionId),
  );
  const sourcePage = inventory.slice(cursor, cursor + MAX_SOURCE_SCAN);
  const loaded = await loadSourcePage(sourcePage);
  const previews = loaded
    // This first experiment uses the current result's competition as a change
    // signal. A historical generation diff will replace this filter later.
    .filter(({ entries }) =>
      entries.some((entry) => competitionIds.has(entry.competitionId)),
    )
    .slice(0, PAGE_SIZE)
    .map(({ source, entries }) => ({
      ...source,
      entries: entries.slice(0, 5),
    }));
  const nextCursor =
    cursor + sourcePage.length < inventory.length
      ? cursor + sourcePage.length
      : null;
  return { previews, nextCursor };
}
