import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { getRegions } from "@/services/regions/service";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import {
  buildFeedStatInventory,
  prioritizeFeedStatInventory,
  type FeedInventoryStat,
} from "./inventory";
import { discoverRecentCompetitionTriggers } from "./recent-changes";
import {
  currentFeedExportVersion,
  readFeedSnapshot,
  writeFeedSnapshot,
} from "./snapshot";

const PAGE_SIZE = 5;
const MAX_SOURCE_SCAN = PAGE_SIZE;
const SOURCE_READ_CONCURRENCY = 2;

export type FeedStatPreview = FeedInventoryStat & {
  entries: RankingEntry[];
  highlightedCompetitionIds: string[];
};

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

export function hasRecentTopFiveEntry(
  entries: readonly Pick<RankingEntry, "competitionId">[],
  competitionIds: ReadonlySet<string>,
) {
  return entries
    .slice(0, 5)
    .some((entry) => competitionIds.has(entry.competitionId));
}

export function hasRecentFeedEntry(
  source: FeedInventoryStat,
  entries: readonly Pick<RankingEntry, "competitionId">[],
  triggers: readonly {
    competitionId: string;
    eventIds: readonly string[];
  }[],
) {
  const competitionIds = new Set(
    triggers
      .filter((trigger) => trigger.eventIds.includes(source.eventId))
      .map((trigger) => trigger.competitionId),
  );
  return hasRecentTopFiveEntry(entries, competitionIds);
}

function highlightedCompetitionIds(
  source: FeedInventoryStat,
  entries: readonly Pick<RankingEntry, "competitionId">[],
  triggers: readonly { competitionId: string; eventIds: readonly string[] }[],
) {
  const recentCompetitionIds = new Set(
    triggers
      .filter((trigger) => trigger.eventIds.includes(source.eventId))
      .map((trigger) => trigger.competitionId),
  );
  return entries
    .filter((entry) => recentCompetitionIds.has(entry.competitionId))
    .map((entry) => entry.competitionId);
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

export async function generateFeedStatPreviews({ now }: { now?: Date } = {}) {
  const [{ triggers }, continents, countries] = await Promise.all([
    discoverRecentCompetitionTriggers({ now }),
    getRegions("continent"),
    getRegions("country"),
  ]);
  const inventory = prioritizeFeedStatInventory(
    buildFeedStatInventory({ continents, countries }),
    triggers,
  );
  const previews: FeedStatPreview[] = [];
  let scanCursor = 0;
  while (scanCursor < inventory.length) {
    const sourcePage = inventory.slice(
      scanCursor,
      scanCursor + MAX_SOURCE_SCAN,
    );
    const loaded = await loadSourcePage(sourcePage);
    const matching = loaded
      .filter(
        ({ source, entries }) =>
          entries.length >= PAGE_SIZE &&
          hasRecentFeedEntry(source, entries, triggers),
      )
      .map(({ source, entries }) => ({
        ...source,
        entries: entries.slice(0, 5),
        highlightedCompetitionIds: highlightedCompetitionIds(
          source,
          entries.slice(0, 5),
          triggers,
        ),
      }));
    previews.push(...matching);
    scanCursor += sourcePage.length;
  }
  return previews;
}

let backgroundBuild: Promise<void> | null = null;

function startBackgroundBuild(now?: Date) {
  if (backgroundBuild) return;
  backgroundBuild = (async () => {
    const exportVersion = await currentFeedExportVersion();
    const previews = await generateFeedStatPreviews({ now });
    if ((await currentFeedExportVersion()) !== exportVersion) return;
    await writeFeedSnapshot({ exportVersion, previews });
  })()
    .catch((error) => {
      console.error("The feed snapshot build failed.", error);
    })
    .finally(() => {
      backgroundBuild = null;
    });
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
  const snapshot = await readFeedSnapshot();
  if (!snapshot) {
    startBackgroundBuild(now);
    return { previews: [], nextCursor: null };
  }
  const previews = snapshot.previews.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor =
    cursor + previews.length < snapshot.previews.length
      ? cursor + previews.length
      : null;
  return { previews, nextCursor };
}
