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
const TOP_SCAN_SIZE = 10;
const MAX_SOURCE_SCAN = PAGE_SIZE;
const SOURCE_READ_CONCURRENCY = 2;

export type FeedStatPreview = FeedInventoryStat & {
  entries: RankingEntry[];
  highlightedCompetitionIds: string[];
};

export type FeedInterestingResult = FeedInventoryStat & {
  interestingEntityId: string;
  interestingResultId: number | undefined;
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
  const [{ triggers }, continents, countries] = await Promise.all([
    discoverRecentCompetitionTriggers({ now }),
    getRegions("continent"),
    getRegions("country"),
  ]);
  const inventory = prioritizeFeedStatInventory(
    buildFeedStatInventory({ continents, countries }),
    triggers,
  );
  const candidates: FeedInterestingResult[] = [];
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
      .map(({ source, entries }) => {
        const recentCompetitionIds = new Set(
          triggers
            .filter((trigger) => trigger.eventIds.includes(source.eventId))
            .map((trigger) => trigger.competitionId),
        );
        const interestingEntry = entries
          .slice(0, TOP_SCAN_SIZE)
          .find((entry) => recentCompetitionIds.has(entry.competitionId));
        if (!interestingEntry) return null;
        const resultId =
          "resultId" in interestingEntry &&
          typeof interestingEntry.resultId === "number"
            ? interestingEntry.resultId
            : undefined;
        return {
          ...source,
          interestingEntityId: String(resultId ?? interestingEntry.personId),
          interestingResultId: resultId,
        };
      })
      .filter(
        (candidate): candidate is FeedInterestingResult => candidate !== null,
      );
    candidates.push(...matching);
    scanCursor += sourcePage.length;
  }
  return candidates;
}

async function loadInterestingResultPage(
  candidates: readonly FeedInterestingResult[],
) {
  const loaded = await loadSourcePage(candidates);
  return loaded.flatMap(({ source, entries }) => {
    const interestingIndex = entries
      .slice(0, TOP_SCAN_SIZE)
      .findIndex((entry) => {
        const resultId =
          "resultId" in entry && typeof entry.resultId === "number"
            ? String(entry.resultId)
            : entry.personId;
        return resultId === source.interestingEntityId;
      });
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

function startBackgroundBuild(now?: Date) {
  if (backgroundBuild) return;
  backgroundBuild = (async () => {
    const exportVersion = await currentFeedExportVersion();
    const candidates = await generateFeedStatPreviews({ now });
    if ((await currentFeedExportVersion()) !== exportVersion) return;
    await writeFeedSnapshot({ exportVersion, candidates });
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
  const candidates = snapshot.candidates.slice(cursor, cursor + PAGE_SIZE);
  const previews = await loadInterestingResultPage(candidates);
  const nextCursor =
    cursor + candidates.length < snapshot.candidates.length
      ? cursor + candidates.length
      : null;
  return { previews, nextCursor };
}
