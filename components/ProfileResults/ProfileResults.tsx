"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { TextDropdown } from "@/components/Dropdown/TextDropdown";
import { EventPicker } from "@/components/EventPicker/EventPicker";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import { RankingsRail } from "@/components/RankingsRail/RankingsRail";
import { formatRankingNumber } from "@/components/RankingsExplorer/types";
import {
  useHasScrolled,
  useTopRailScrollProgress,
} from "@/components/RankingsExplorer/useRailScrollProgress";
import { useRankingListOffset } from "@/components/RankingsExplorer/useRankingListOffset";
import { StatPageLayout } from "@/components/StatPageLayout/StatPageLayout";
import { formatWcaResult, WCA_EVENTS, type RankingType } from "@/lib/wca";
import { profileResultsHref } from "./profileResultsUrl";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 65;

type ResultEntry = {
  rank: number;
  position: number;
  resultId: number;
  attemptNumber: number | null;
  resultValue: number;
  formattedValue: string;
  personId: string;
  personName: string;
  competitionId: string;
  competitionName: string;
  competitionStartDate: string | null;
  recordCode: string;
};

type ResultResponse = {
  entries: ResultEntry[];
  total: number;
  availableYears: number[];
  hasMore: boolean;
  snapshot?: { exportDate: string | null };
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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
  const [entries, setEntries] = useState<ResultEntry[]>([]);
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

  const chooseYear = (value: string) => {
    router.replace(
      profileResultsHref({
        personId,
        eventId,
        resultType,
        year: value ? Number(value) : null,
      }),
    );
  };

  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;
  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? -1;
  const firstVisibleIndex = virtualRows[0]?.index ?? 0;
  const railYears =
    year !== null && !availableYears.includes(year)
      ? [year, ...availableYears]
      : availableYears;
  const yearOptions = [
    { value: "", label: "All time" },
    ...railYears.map((availableYear) => ({
      value: `${availableYear}`,
      label: `${availableYear}`,
    })),
  ];

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
              <div className="listItem">
                <div
                  className={`row${virtualRow.index % 2 ? " row--alternate" : ""}`}
                >
                  <div className="rowHeader">
                    <span className="rank">
                      {formatRankingNumber(entry.rank)}
                    </span>
                    <span className="identity">
                      <span className="personName">
                        <span className="name">{entry.competitionName}</span>
                        <span className="wcaId">
                          {formatDate(entry.competitionStartDate)}
                        </span>
                      </span>
                    </span>
                    <span className="result">
                      <span className="resultValue">
                        {entry.recordCode && (
                          <span
                            className={`recordBadge recordBadge--${entry.recordCode}`}
                          >
                            {entry.recordCode}
                          </span>
                        )}
                        <span className="best">
                          {entry.formattedValue ||
                            formatWcaResult(
                              eventId,
                              entry.resultValue,
                              resultType,
                            )}
                        </span>
                      </span>
                      {entry.attemptNumber !== null && (
                        <span className="competitionName">
                          Attempt {entry.attemptNumber}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
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
            <div className="Jump-railSettings">
              <EventPicker event={event} onChange={chooseEvent} />
              <div className="Jump-resultTypeControl">
                <button
                  className="Jump-resultTypeToggle"
                  type="button"
                  disabled={eventId === "333mbf"}
                  onClick={() =>
                    chooseResultType(
                      resultType === "single" ? "average" : "single",
                    )
                  }
                >
                  {resultType === "single" ? "Single" : "Average"}
                </button>
              </div>
              <TextDropdown
                options={yearOptions}
                value={year ? `${year}` : ""}
                onChange={chooseYear}
                ariaLabel="Year"
                className="personYearDropdown Jump-periodPicker"
              />
            </div>
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
