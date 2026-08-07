import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { LRUCache } from "lru-cache";
import { getRegions } from "@/services/regions/service";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";
import { loadPersonMedalRankings } from "@/services/rankings/medals";
import { loadPersonActivityRankings } from "@/services/rankings/person-activity";
import { loadPersonPrStreakRankings } from "@/services/rankings/person-pr-streak";
import { loadCompetitionRankings } from "@/services/rankings/competition-rankings";
import { loadCityRankings } from "@/services/rankings/city-rankings";
import { generateBatchedFeedCandidates } from "./batched-candidates";
import {
  FEED_ITEM_PAGE_SIZE,
  FEED_PAGE_SIZE,
  FEED_TOP_SCAN_SIZE,
} from "./constants";
import {
  buildRecentFeedStatInventory,
  prioritizeFeedStatInventory,
  type FeedInventoryStat,
} from "./inventory";
import {
  discoverRecentCompetitionTriggers,
  discoverRecentResultReferences,
} from "./recent-changes";
import { currentFeedExportVersion } from "./snapshot";
import { readFeedItems, replaceFeedItems } from "./items";
import { addFeedStatPopularity, sortFeedCandidates } from "./sort";
import { readPopularRankingDescriptors } from "@/services/ranking-popularity/read-service";
import type { FeedUserPreferences } from "./preferences";
import { readRedisJson, writeRedisJson } from "@/services/cache/redis";

const PAGE_SIZE = FEED_PAGE_SIZE;
const TOP_SCAN_SIZE = FEED_TOP_SCAN_SIZE;
const PREVIEW_CANDIDATE_SCAN_SIZE = 20;
const SOURCE_READ_CONCURRENCY = 2;
const sourceEntriesCache = new LRUCache<string, RankingEntry[]>({ max: 256 });

function normalizeSourceEntries(entries: readonly Record<string, unknown>[]) {
  function subRank(entry: Record<string, unknown>) {
    if (typeof entry.subRank === "number") return entry.subRank;
    if (typeof entry.position === "number") return entry.position;
    return Number(entry.rank);
  }
  return entries.map((entry) => ({
    ...entry,
    subRank: subRank(entry),
  })) as unknown as RankingEntry[];
}

function sourceRegionRank(source: FeedInterestingResult) {
  if (source.region.scope === "world") return source.worldRank;
  if (source.region.scope === "continent") return source.continentRank;
  return source.countryRank;
}

function sourceEntityId(source: FeedInventoryStat, entry: RankingEntry) {
  if (source.kind === "result") {
    return typeof entry.resultId === "number" ? String(entry.resultId) : "";
  }
  return entry.personId;
}

export type FeedStatPreview = FeedInventoryStat & {
  entries: RankingEntry[];
  highlightedCompetitionIds: string[];
  interestingEntityId?: string;
  interestingResultId?: number;
};

export type FeedInterestingResult = FeedInventoryStat & {
  interestingEntityId: string;
  interestingResultId: number | undefined;
  worldRank: number | null;
  continentRank: number | null;
  countryRank: number | null;
  statPopularityScore?: number;
};

export type FeedStatPreviewPage = {
  previews: FeedStatPreview[];
  nextCursor: number | null;
};

export type FeedInterestingItemPage = {
  items: FeedInterestingResult[];
  nextCursor: number | null;
};

export function dedupeInterestingResults(
  candidates: readonly FeedInterestingResult[],
) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key =
      candidate.interestingResultId === undefined
        ? `${candidate.eventId}:${candidate.interestingEntityId}`
        : String(candidate.interestingResultId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortedFeedCandidates(
  candidates: readonly FeedInterestingResult[],
  preferences: Parameters<typeof sortFeedCandidates>[1],
  popularity: Awaited<ReturnType<typeof readPopularRankingDescriptors>>,
) {
  return dedupeInterestingResults(
    sortFeedCandidates(
      addFeedStatPopularity(candidates, popularity),
      preferences,
    ),
  );
}

function sourceParams(source: FeedInventoryStat) {
  const params = new URLSearchParams({
    eventId: source.eventId,
    result: source.resultType,
    start:
      source.kind === "person" ||
      source.kind === "person-competition" ||
      source.kind === "person-medals" ||
      source.kind.startsWith("person-activity-")
        ? "1"
        : "0",
    limit: "50",
  });
  if (source.region.scope !== "world") {
    params.set("region", source.region.regionId);
  }
  if (source.gender !== null) params.set("gender", source.gender);
  if (source.year !== null) params.set("year", String(source.year));
  if (source.kind === "person-medals") params.set("medal", "overall");
  if (source.kind.startsWith("person-activity-")) {
    params.set("metric", source.kind.replace("person-activity-", ""));
  }
  if (source.kind === "competition" || source.kind === "city") {
    params.set("ranking", "fastest");
  }
  return params;
}

async function loadSourceEntries(source: FeedInventoryStat) {
  try {
    const params = sourceParams(source);
    if (source.kind === "person") {
      if (source.eventId === "pr-streak") {
        const result = await loadPersonPrStreakRankings(params);
        return normalizeSourceEntries(
          (result.data.entries ?? []) as unknown as Record<string, unknown>[],
        );
      }
      const result = await loadRankingsWithDiagnostics(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    if (source.kind === "result") {
      const result = await loadResultRankings(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    if (source.kind === "person-competition") {
      const result = await loadPersonCompetitionRankings(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    if (source.kind === "person-medals") {
      const result = await loadPersonMedalRankings(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    if (source.kind.startsWith("person-activity-")) {
      const result = await loadPersonActivityRankings(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    if (source.kind === "competition") {
      const result = await loadCompetitionRankings(params);
      return normalizeSourceEntries(
        (result.data.entries ?? []) as unknown as Record<string, unknown>[],
      );
    }
    const result = await loadCityRankings(params);
    return normalizeSourceEntries(
      (result.data.entries ?? []) as unknown as Record<string, unknown>[],
    );
  } catch {
    return [];
  }
}

async function sourceEntries(source: FeedInventoryStat) {
  const cacheKey = `feed-stat:${JSON.stringify(source)}`;
  const local = sourceEntriesCache.get(cacheKey);
  if (local) return local;
  const cached = await readRedisJson<RankingEntry[]>(cacheKey);
  if (cached) {
    sourceEntriesCache.set(cacheKey, cached);
    return cached;
  }
  const entries = await loadSourceEntries(source);
  if (entries.length) {
    sourceEntriesCache.set(cacheKey, entries);
    void writeRedisJson(cacheKey, entries);
  }
  return entries;
}

export function hasRecentTopTenEntry(
  entries: readonly Pick<RankingEntry, "competitionId">[],
  competitionIds: ReadonlySet<string>,
) {
  return entries
    .slice(0, TOP_SCAN_SIZE)
    .some((entry) => competitionIds.has(entry.competitionId));
}

export function selectFeedPreviewEntries<
  Entry extends Pick<RankingEntry, "competitionId">,
>(
  entries: readonly Entry[],
  competitionIds: ReadonlySet<string>,
  preferredIndex?: number,
) {
  const topTen = entries.slice(0, TOP_SCAN_SIZE);
  const changedIndex =
    preferredIndex ??
    topTen.findIndex((entry) => competitionIds.has(entry.competitionId));
  if (changedIndex < 0 || topTen.length < PAGE_SIZE) return [];
  const start = Math.max(
    0,
    Math.min(changedIndex - 2, topTen.length - PAGE_SIZE),
  );
  return topTen.slice(start, start + PAGE_SIZE);
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
  return hasRecentTopTenEntry(entries, competitionIds);
}

async function loadSourcePage<T extends FeedInventoryStat>(
  sourcePage: readonly T[],
) {
  const loaded: Array<{ source: T; entries: RankingEntry[] }> = [];
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
    (item): item is { source: T; entries: RankingEntry[] } =>
      item !== undefined,
  );
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort());
}

async function generateFeedStatPreviews({ now }: { now?: Date } = {}) {
  const [triggerResult, referenceResult, continents, countries] =
    await Promise.all([
      discoverRecentCompetitionTriggers({ now }),
      discoverRecentResultReferences({ now }),
      getRegions("continent"),
      getRegions("country"),
    ]);
  const { triggers } = triggerResult;
  const { references } = referenceResult;
  const inventory = prioritizeFeedStatInventory(
    buildRecentFeedStatInventory({ references, continents, countries }),
    triggers,
  );
  const candidates = await generateBatchedFeedCandidates({
    references,
    inventory,
  });
  return {
    candidates,
    details: {
      triggerQueryMs: Math.round(triggerResult.triggerQueryMs * 100) / 100,
      resultQueryMs: Math.round(referenceResult.resultQueryMs * 100) / 100,
      triggerCount: triggers.length,
      referenceCount: references.length,
      inventoryCount: inventory.length,
      inventoryByKind: countBy(inventory, (item) => item.kind),
      inventoryByEvent: countBy(
        inventory,
        (item) => `${item.eventId} (${item.eventName})`,
      ),
      candidateCount: candidates.length,
      candidatesByKind: countBy(candidates, (item) => item.kind),
      candidatesByEvent: countBy(
        candidates,
        (item) => `${item.eventId} (${item.eventName})`,
      ),
      competitions: triggers.map((trigger) => ({
        id: trigger.competitionId,
        name: trigger.competitionName,
        endDate: trigger.endDate,
        eventIds: trigger.eventIds,
        countryRecordEventIds: trigger.countryRecordEventIds,
      })),
    },
  };
}

async function loadInterestingResultPage(
  candidates: readonly FeedInterestingResult[],
  preferences: Parameters<typeof sortFeedCandidates>[1],
  popularity: Awaited<ReturnType<typeof readPopularRankingDescriptors>>,
) {
  const loaded = await loadSourcePage(
    sortedFeedCandidates(
      candidates.filter((candidate) => {
        const rank = sourceRegionRank(candidate);
        return rank !== null && rank <= TOP_SCAN_SIZE;
      }),
      preferences,
      popularity,
    ),
  );
  return loaded.flatMap(({ source, entries }) => {
    const interestingIndex = entries
      .slice(0, TOP_SCAN_SIZE)
      .findIndex(
        (entry) => sourceEntityId(source, entry) === source.interestingEntityId,
      );
    if (interestingIndex < 0) return [];
    const interestingEntry = entries[interestingIndex];
    if (!interestingEntry) return [];
    const previewEntries = selectFeedPreviewEntries(
      entries,
      new Set([interestingEntry.competitionId]),
      interestingIndex,
    );
    if (previewEntries.length < PAGE_SIZE) return [];
    return [
      {
        ...source,
        entries: previewEntries,
        highlightedCompetitionIds: [interestingEntry.competitionId],
      },
    ];
  });
}

let backgroundBuild: Promise<void> | null = null;

export async function buildFeedItems({ now }: { now?: Date } = {}) {
  const exportVersion = await currentFeedExportVersion();
  const { candidates, details } = await generateFeedStatPreviews({ now });
  if ((await currentFeedExportVersion()) !== exportVersion) {
    return {
      exportVersion,
      candidateCount: candidates.length,
      written: false,
      details,
    };
  }
  const selected = dedupeInterestingResults(
    sortFeedCandidates(candidates, null),
  );
  await replaceFeedItems(selected, { exportVersion });
  return {
    exportVersion,
    candidateCount: candidates.length,
    written: true,
    details,
  };
}

export async function ensureFeedItems({ now }: { now?: Date } = {}) {
  const exportVersion = await currentFeedExportVersion();
  const result = await readFeedItems({
    cursor: 0,
    limit: 1,
    now,
  });
  if (result.length > 0) {
    return {
      exportVersion,
      written: false,
      candidateCount: result.length,
    };
  }
  return buildFeedItems({ now });
}

export async function seedFeedStatPreviews({ now }: { now?: Date } = {}) {
  let cursor = 0;
  let seeded = 0;
  while (true) {
    const items = await readFeedItems({ cursor, limit: 1, now });
    const item = items[0];
    if (!item) break;
    await loadInterestingResultPage([item], null, []);
    seeded += 1;
    cursor += items.length;
  }
  return seeded;
}

function startBackgroundBuild(now?: Date) {
  if (backgroundBuild) return;
  const workerUrl = process.env.FEED_WORKER_URL;
  if (workerUrl) {
    backgroundBuild = fetch(`${workerUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "feed.generate" }),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Feed worker returned ${response.status}.`);
      })
      .catch((error) => {
        console.error("The feed worker request failed.", error);
      })
      .finally(() => {
        backgroundBuild = null;
      });
    return;
  }
  backgroundBuild = (async () => {
    await buildFeedItems({ now });
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
  preferences = null,
  limit = PAGE_SIZE,
}: {
  cursor?: number;
  now?: Date;
  preferences?: FeedUserPreferences | null;
  limit?: number;
} = {}): Promise<FeedStatPreviewPage> {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("The feed cursor must be a non-negative integer.");
  }
  const candidates = await readFeedItems({
    cursor,
    limit: PREVIEW_CANDIDATE_SCAN_SIZE,
    now,
    preferences,
  });
  if (candidates.length === 0 && cursor === 0) startBackgroundBuild(now);
  const previews = (
    await loadInterestingResultPage(candidates, preferences, [])
  ).slice(0, limit);
  const nextCursor =
    candidates.length === PREVIEW_CANDIDATE_SCAN_SIZE
      ? cursor + candidates.length
      : null;
  return { previews, nextCursor };
}

export async function loadFeedInterestingItems({
  cursor = 0,
  now,
  preferences = null,
}: {
  cursor?: number;
  now?: Date;
  preferences?: FeedUserPreferences | null;
} = {}): Promise<FeedInterestingItemPage> {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("The feed item cursor must be a non-negative integer.");
  }
  const items = await readFeedItems({
    cursor,
    limit: FEED_ITEM_PAGE_SIZE,
    now,
    preferences,
  });
  if (items.length === 0 && cursor === 0) startBackgroundBuild(now);
  return {
    items,
    nextCursor:
      items.length === FEED_ITEM_PAGE_SIZE ? cursor + items.length : null,
  };
}
