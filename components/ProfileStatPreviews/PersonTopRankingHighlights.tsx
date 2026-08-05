"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import { RankingRow } from "@/components/RankingRow/RankingRow";
import type { RankingEntry } from "@/components/RankingsExplorer/types";
import type { GenderFilter, RankingType } from "@/lib/wca";
import { StatPreviewTable } from "./StatPreviewTable";

type Highlight = {
  id: string;
  title: string;
  eventId: string;
  resultType: RankingType;
  scope: "world" | "continent" | "country";
  regionId: string;
  gender: GenderFilter | null;
  year: number | null;
  entries: RankingEntry[];
};

type Response = {
  entries: Highlight[];
  nextCursor: number | null;
  hasMore: boolean;
  error?: string;
};

function exploreHref(highlight: Highlight) {
  const params = new URLSearchParams({
    eventId: highlight.eventId,
    result: highlight.resultType,
  });
  if (highlight.scope !== "world") params.set("region", highlight.regionId);
  if (highlight.gender !== null) params.set("gender", highlight.gender);
  if (highlight.year !== null) params.set("year", String(highlight.year));
  return `/?${params.toString()}`;
}

function HighlightPreview({
  highlight,
  personId,
}: {
  highlight: Highlight;
  personId: string;
}) {
  return (
    <StatPreviewTable
      tableName={highlight.title}
      surfaceClassName="profileRankingHighlightPreviewTable"
      action={
        <Link className="profilePreviewExplore" href={exploreHref(highlight)}>
          Explore
        </Link>
      }
    >
      <ol className="list profilePreviewRows profileRankingHighlightRows">
        {highlight.entries.map((entry, index) => (
          <RankingRow
            key={`${highlight.id}:${entry.personId}:${entry.subRank}`}
            entry={entry}
            display={{
              eventId: highlight.eventId,
              rankingType: highlight.resultType,
              animationIndex: index,
              alternate: index % 2 === 1,
              highlighted: entry.personId === personId,
              rankIsDuplicate:
                index > 0 && highlight.entries[index - 1].rank === entry.rank,
            }}
          />
        ))}
      </ol>
    </StatPreviewTable>
  );
}

function PersonTopRankingHighlightsFeed({ personId }: { personId: string }) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (cursor: number, shown: readonly string[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      const controller = new AbortController();
      requestController.current = controller;
      const params = new URLSearchParams({ cursor: String(cursor) });
      shown.forEach((id) => params.append("shown", id));
      try {
        const response = await fetch(
          `/api/people/${personId}/top-ranking-highlights?${params.toString()}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as Response;
        if (!response.ok) {
          throw new Error(body.error ?? "Top rankings are unavailable.");
        }
        setHighlights((current) => {
          const known = new Set(current.map((item) => item.id));
          return [
            ...current,
            ...body.entries.filter((item) => !known.has(item.id)),
          ];
        });
        setNextCursor(body.nextCursor);
        setHasMore(body.hasMore);
        setError(null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Top rankings are unavailable.",
        );
        setNextCursor(null);
        setHasMore(false);
      } finally {
        if (requestController.current === controller) {
          requestController.current = null;
          inFlight.current = false;
          if (!controller.signal.aborted) setLoading(false);
        }
      }
    },
    [personId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(0, []);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (!hasMore || nextCursor === null || loading) return;
    void loadPage(
      nextCursor,
      highlights.map((highlight) => highlight.id),
    );
  }, [hasMore, highlights, loading, loadPage, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "320px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading]);

  if (!loading && highlights.length === 0 && !error) return null;

  return (
    <section className="profileRankingHighlights" aria-label="Top rankings">
      {highlights.map((highlight) => (
        <HighlightPreview
          highlight={highlight}
          key={highlight.id}
          personId={personId}
        />
      ))}
      {error && <p className="profileStatsMessage">{error}</p>}
      {loading && (
        <div className="profileRankingHighlightsLoading">
          <LoadingSpinner label="Loading top rankings" />
        </div>
      )}
      {hasMore && <div aria-hidden="true" ref={sentinelRef} />}
    </section>
  );
}

export function PersonTopRankingHighlights({ personId }: { personId: string }) {
  return <PersonTopRankingHighlightsFeed key={personId} personId={personId} />;
}
