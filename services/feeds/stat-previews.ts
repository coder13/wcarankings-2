import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { getRegions } from "@/services/regions/service";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";
import { loadPersonMedalRankings } from "@/services/rankings/medals";
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
import {
  currentFeedExportVersion,
  readFeedSnapshot,
  writeFeedSnapshot,
} from "./snapshot";
import { addFeedStatPopularity, sortFeedCandidates } from "./sort";
import { readPopularRankingDescriptors } from "@/services/ranking-popularity/read-service";
import type { FeedUserPreferences } from "./preferences";

const PAGE_SIZE = FEED_PAGE_SIZE;
const TOP_SCAN_SIZE = FEED_TOP_SCAN_SIZE;
const PREVIEW_CANDIDATE_SCAN_SIZE = 20;
const SOURCE_READ_CONCURRENCY = 2;

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

function uniqueInterestingResults(
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
  return uniqueInterestingResults(
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
      source.kind === "person-medals"
        ? "1"
        : "0",
    limit: "20",
  });
  if (source.region.scope !== "world") {
    params.set("region", source.region.regionId);
  }
  if (source.gender !== null) params.set("gender", source.gender);
  if (source.year !== null) params.set("year", String(source.year));
  if (source.kind === "person-medals") params.set("medal", "overall");
  if (source.kind === "competition" || source.kind === "city") {
    params.set("ranking", "fastest");
  }
  return params;
}

async function sourceEntries(source: FeedInventoryStat) {
  try {
    const params = sourceParams(source);
    if (source.kind === "person") {
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

export async function generateFeedStatPreviews({ now }: { now?: Date } = {}) {
  const [{ triggers }, { references }, continents, countries] =
    await Promise.all([
      discoverRecentCompetitionTriggers({ now }),
      discoverRecentResultReferences({ now }),
      getRegions("continent"),
      getRegions("country"),
    ]);
  const inventory = prioritizeFeedStatInventory(
    buildRecentFeedStatInventory({ references, continents, countries }),
    triggers,
  );
  return generateBatchedFeedCandidates({
    references,
    inventory,
  });
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

export async function buildFeedSnapshot({ now }: { now?: Date } = {}) {
  const exportVersion = await currentFeedExportVersion();
  const candidates = await generateFeedStatPreviews({ now });
  if ((await currentFeedExportVersion()) !== exportVersion) {
    return { exportVersion, candidateCount: candidates.length, written: false };
  }
  await writeFeedSnapshot({ exportVersion, candidates });
  return { exportVersion, candidateCount: candidates.length, written: true };
}

export async function ensureFeedSnapshot({ now }: { now?: Date } = {}) {
  const snapshot = await readFeedSnapshot();
  if (snapshot) {
    return {
      exportVersion: snapshot.exportVersion,
      written: false,
      candidateCount: snapshot.candidates.length,
    };
  }
  return buildFeedSnapshot({ now });
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
    await buildFeedSnapshot({ now });
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
}: {
  cursor?: number;
  now?: Date;
  preferences?: FeedUserPreferences | null;
} = {}): Promise<FeedStatPreviewPage> {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("The feed cursor must be a non-negative integer.");
  }
  const snapshot = await readFeedSnapshot();
  if (!snapshot) {
    startBackgroundBuild(now);
    return { previews: [], nextCursor: null };
  }
  const popularity = await readPopularRankingDescriptors({
    limit: 100,
    viewedAt: now ?? new Date(),
  }).catch((error) => {
    console.warn("Feed stat popularity is unavailable.", error);
    return [];
  });
  const candidates = sortedFeedCandidates(
    snapshot.candidates,
    preferences,
    popularity,
  ).slice(cursor, cursor + PREVIEW_CANDIDATE_SCAN_SIZE);
  const previews = (
    await loadInterestingResultPage(candidates, preferences, popularity)
  ).slice(0, PAGE_SIZE);
  const nextCursor =
    cursor + candidates.length < snapshot.candidates.length
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
  const snapshot = await readFeedSnapshot();
  if (!snapshot) {
    startBackgroundBuild(now);
    return { items: [], nextCursor: null };
  }
  const popularity = await readPopularRankingDescriptors({
    limit: 100,
    viewedAt: now ?? new Date(),
  }).catch(() => []);
  const candidates = sortedFeedCandidates(
    snapshot.candidates,
    preferences,
    popularity,
  );
  const items = candidates.slice(cursor, cursor + FEED_ITEM_PAGE_SIZE);
  return {
    items,
    nextCursor:
      cursor + items.length < candidates.length ? cursor + items.length : null,
  };
}
