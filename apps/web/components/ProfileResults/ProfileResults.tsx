"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EventPicker } from "@/components/EventPicker/EventPicker";
import {
  InputContainer,
  InputContainerItem,
} from "@/components/InputContainer/InputContainer";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import { RankingsRail } from "@/components/RankingsRail/RankingsRail";
import { ResultTypeToggle } from "@/components/RankingsRail/ResultTypeToggle";
import { YearSelector } from "@/components/RankingsRail/YearSelector";
import {
  useHasScrolled,
  useTopRailScrollProgress,
} from "@/components/RankingsExplorer/useRailScrollProgress";
import { useRankingListOffset } from "@/components/RankingsExplorer/useRankingListOffset";
import { StatPageLayout } from "@/components/StatPageLayout/StatPageLayout";
import { WCA_EVENTS, type RankingType } from "@/lib/wca";
import { PersonResultRow, type PersonResultEntry } from "./PersonResultRow";
import { profileResultsHref } from "./profileResultsUrl";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 65;

type ResultResponse = {
  entries: PersonResultEntry[];
  total: number;
  availableYears: number[];
  hasMore: boolean;
  snapshot?: { exportDate: string | null };
  error?: string;
};

function resultUrl(
  personId: string,
  eventId: string,
  resultType: RankingType,
  year: number | null,
  start: number,
) {
  const params = new URLSearchParams({
    result: resultType,
    limit: `${PAGE_SIZE}`,
    start: `${start}`,
  });
  if (year !== null) params.set("year", `${year}`);
  return `/api/people/${personId}/event/${eventId}/results?${params.toString()}`;
}

export function ProfileResults({
  personId,
  eventId,
  resultType,
  year,
}: {
  personId: string;
  eventId: string;
  resultType: RankingType;
  year: number | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<PersonResultEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [personName, setPersonName] = useState(personId);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [exportDate, setExportDate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const datasetKey = `${personId}:${eventId}:${resultType}:${year ?? ""}`;
  const railProgress = useTopRailScrollProgress(ROW_HEIGHT * 2);
  const hasScrolled = useHasScrolled();
  const listOffset = useRankingListOffset();
  const virtualizer = useWindowVirtualizer({
    count: total,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });

  const loadPage = useCallback(
    async (start: number, append: boolean, signal?: AbortSignal) => {
      const response = await fetch(
        resultUrl(personId, eventId, resultType, year, start),
        { signal },
      );
      const body = (await response.json()) as ResultResponse;
      if (!response.ok)
        throw new Error(body.error ?? "Results are unavailable.");
      setEntries((current) =>
        append ? [...current, ...body.entries] : body.entries,
      );
      setTotal(body.total);
      setPersonName(body.entries[0]?.personName ?? personId);
      setAvailableYears(body.availableYears);
      setExportDate(body.snapshot?.exportDate ?? null);
      return body;
    },
    [eventId, personId, resultType, year],
  );

  useEffect(() => {
    const controller = new AbortController();
    // The URL changed. Reset the old query state before loading the next one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries([]);
    setTotal(0);
    setError("");
    setLoading(true);
    window.scrollTo({ top: 0, behavior: "auto" });
    loadPage(1, false, controller.signal)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Results are unavailable.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [datasetKey, loadPage]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || entries.length >= total) return;
    setLoadingMore(true);
    loadPage(entries.length + 1, true)
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Results are unavailable.",
        );
      })
      .finally(() => setLoadingMore(false));
  }, [entries.length, loadPage, loading, loadingMore, total]);

  const chooseResultType = (nextResultType: RankingType) => {
    router.replace(
      profileResultsHref({
        personId,
        eventId,
        resultType: nextResultType,
        year,
      }),
    );
  };

  const chooseEvent = (nextEventId: string) => {
    const nextResultType = nextEventId === "333mbf" ? "single" : resultType;
    router.replace(
      profileResultsHref({
        personId,
        eventId: nextEventId,
        resultType: nextResultType,
        year,
      }),
    );
  };

  const chooseYear = (nextYear: number | null) => {
    router.replace(
      profileResultsHref({
        personId,
        eventId,
        resultType,
        year: nextYear,
      }),
    );
  };

  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;
  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? -1;
  const firstVisibleIndex = virtualRows[0]?.index ?? 0;
  useEffect(() => {
    // The window virtualizer reports the current visible range after render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastVisibleIndex >= entries.length - 16) loadMore();
  }, [entries.length, lastVisibleIndex, loadMore]);

  let resultContent;
  if (error) {
    resultContent = <div className="listMessage">{error}</div>;
  } else if (loading && entries.length === 0) {
    resultContent = (
      <div className="listMessage listMessage--initialLoading listMessage--delayed">
        <LoadingSpinner label="Loading results" />
      </div>
    );
  } else if (total === 0) {
    resultContent = (
      <div className="listMessage">
        No official results match this event, result type, and year.
      </div>
    );
  } else {
    resultContent = (
      <ol
        className="list"
        data-rankings-list
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const entry = entries[virtualRow.index];
          if (!entry) {
            return (
              <div
                key={virtualRow.key}
                className="virtualRow"
                data-loading
                style={{
                  transform: `translateY(${virtualRow.start - listOffset}px)`,
                }}
              >
                <div className="row row--loading" aria-hidden="true" />
              </div>
            );
          }
          return (
            <div
              key={entry.resultId + (entry.attemptNumber ?? 0)}
              className="virtualRow"
              data-alternate={virtualRow.index % 2 === 1}
              style={{
                transform: `translateY(${virtualRow.start - listOffset}px)`,
              }}
            >
              <PersonResultRow
                entry={entry}
                eventId={eventId}
                resultType={resultType}
                rowIndex={virtualRow.index}
              />
            </div>
          );
        })}
      </ol>
    );
  }

  return (
    <StatPageLayout
      className="profileResultsPage"
      header={
        <Link className="profileResultsPersonLink" href={`/person/${personId}`}>
          {personName}
        </Link>
      }
      hasScrolled={hasScrolled}
      exportDate={exportDate}
      navigation={{
        currentPosition: firstVisibleIndex + 1,
        total,
        onJumpUp: () =>
          virtualizer.scrollToIndex(Math.max(0, firstVisibleIndex - 5_000)),
        onJumpDown: () =>
          virtualizer.scrollToIndex(
            Math.min(total - 1, firstVisibleIndex + 5_000),
          ),
        onJumpToTop: () => virtualizer.scrollToIndex(0),
        onJumpToEnd: () => virtualizer.scrollToIndex(Math.max(0, total - 1)),
      }}
      topRail={
        <div
          className="stickyRankingsRail"
          style={{ "--rail-scroll-progress": railProgress } as CSSProperties}
        >
          <RankingsRail
            className="Jump--rankings Jump--profileResults"
            direction="up"
            compactResultType={railProgress >= 1}
          >
            <InputContainer className="Jump-railSettings">
              <InputContainerItem
                className="Jump-eventControl"
                width="var(--rail-event-width)"
              >
                <EventPicker event={event} onChange={chooseEvent} />
              </InputContainerItem>
              <InputContainerItem
                className="Jump-resultTypeControl"
                width="var(--input-result-type-width)"
              >
                <ResultTypeToggle
                  value={resultType}
                  disabled={eventId === "333mbf"}
                  onChange={chooseResultType}
                />
              </InputContainerItem>
              <InputContainerItem
                className="Jump-periodControl"
                width="var(--rail-period-width)"
              >
                <YearSelector
                  year={year}
                  availableYears={availableYears}
                  onChange={chooseYear}
                  className="personYearDropdown Jump-periodPicker"
                />
              </InputContainerItem>
            </InputContainer>
          </RankingsRail>
        </div>
      }
    >
      <main>
        <div className="outerListWrapper" data-rankings-list-container>
          <div className="listContainer">{resultContent}</div>
        </div>
      </main>
    </StatPageLayout>
  );
}
