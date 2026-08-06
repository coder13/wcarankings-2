import type { RankingEntry } from "@/components/RankingsExplorer/types";
import { WCA_EVENTS } from "@/lib/wca";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import { discoverRecentCompetitionTriggers } from "./recent-changes";

const PAGE_SIZE = 5;
const MAX_SOURCE_SCAN = 20;

type PreviewSource = {
  id: string;
  title: string;
  eventId: string;
  resultType: "single" | "average";
  kind: "person" | "result";
  exploreUrl: string;
};

export type FeedStatPreview = PreviewSource & { entries: RankingEntry[] };

export type FeedStatPreviewPage = {
  previews: FeedStatPreview[];
  nextCursor: number | null;
};

const SOURCE_VARIANTS = [
  ["333", "single"],
  ["333", "average"],
  ["222", "single"],
  ["222", "average"],
  ["444", "single"],
  ["444", "average"],
  ["555", "single"],
  ["555", "average"],
  ["333oh", "single"],
  ["pyram", "single"],
] as const;

const PREVIEW_SOURCES: PreviewSource[] = SOURCE_VARIANTS.flatMap(
  ([eventId, resultType]) => [
    {
      id: `person-${eventId}-${resultType}`,
      title: `${eventName(eventId)} · ${resultTypeLabel(resultType)}`,
      eventId,
      resultType,
      kind: "person" as const,
      exploreUrl: `/?eventId=${eventId}&result=${resultType}`,
    },
    {
      id: `result-${eventId}-${resultType}`,
      title: `${eventName(eventId)} · Best results · ${resultTypeLabel(resultType)}`,
      eventId,
      resultType,
      kind: "result" as const,
      exploreUrl: `/results?eventId=${eventId}&result=${resultType}`,
    },
  ],
);

function eventName(eventId: string) {
  return WCA_EVENTS.find((event) => event.id === eventId)?.name ?? eventId;
}

function resultTypeLabel(resultType: "single" | "average") {
  return resultType === "single" ? "Single" : "Average";
}

async function sourceEntries(source: PreviewSource) {
  const params = new URLSearchParams({
    eventId: source.eventId,
    result: source.resultType,
    start: source.kind === "person" ? "1" : "0",
    limit: "20",
  });
  if (source.kind === "person") {
    const result = await loadRankingsWithDiagnostics(params);
    return result.data.entries ?? [];
  }
  const result = await loadResultRankings(params);
  return result.data.entries ?? [];
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
  const { triggers } = await discoverRecentCompetitionTriggers({ now });
  const competitionIds = new Set(
    triggers.map((trigger) => trigger.competitionId),
  );
  const sourcePage = PREVIEW_SOURCES.slice(cursor, cursor + MAX_SOURCE_SCAN);
  const loaded = await Promise.all(
    sourcePage.map(async (source) => ({
      source,
      entries: await sourceEntries(source),
    })),
  );
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
    cursor + sourcePage.length < PREVIEW_SOURCES.length
      ? cursor + sourcePage.length
      : null;
  return { previews, nextCursor };
}
