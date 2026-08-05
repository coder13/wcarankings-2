"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { formatWcaResult, WCA_EVENTS, type RankingType } from "@/lib/wca";
import { profileResultsHref } from "./profileResultsUrl";

const PAGE_SIZE = 100;
const ROW_HEIGHT = 72;

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
  hasMore: boolean;
  error?: string;
};

type PersonSearchEntry = {
  personId: string;
  name: string;
};

type PersonSearchResponse = {
  entries: PersonSearchEntry[];
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
  start: number,
) {
  const params = new URLSearchParams({
    result: resultType,
    limit: `${PAGE_SIZE}`,
    start: `${start}`,
  });
  return `/api/people/${personId}/event/${eventId}/results?${params.toString()}`;
}

export function ProfileResults({
  personId,
  eventId,
  resultType,
}: {
  personId: string;
  eventId: string;
  resultType: RankingType;
}) {
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<ResultEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [personName, setPersonName] = useState(personId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [personPickerOpen, setPersonPickerOpen] = useState(false);
  const [personMatches, setPersonMatches] = useState<PersonSearchEntry[]>([]);
  const datasetKey = `${personId}:${eventId}:${resultType}`;
  // TanStack Virtual returns callback-bearing objects. This component does not memoize them.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const loadPage = useCallback(
    async (start: number, append: boolean, signal?: AbortSignal) => {
      const response = await fetch(
        resultUrl(personId, eventId, resultType, start),
        {
          signal,
        },
      );
      const body = (await response.json()) as ResultResponse;
      if (!response.ok)
        throw new Error(body.error ?? "Results are unavailable.");
      setEntries((current) =>
        append ? [...current, ...body.entries] : body.entries,
      );
      setTotal(body.total);
      setPersonName(body.entries[0]?.personName ?? personId);
      return body;
    },
    [eventId, personId, resultType],
  );

  useEffect(() => {
    const controller = new AbortController();
    setEntries([]);
    setTotal(0);
    setError("");
    setLoading(true);
    listRef.current?.scrollTo({ top: 0 });
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

  useEffect(() => {
    const query = personQuery.trim();
    const ready =
      personPickerOpen &&
      query.length >= 2 &&
      (!/^\d/.test(query) || /^\d{4}[a-z]{2}/i.test(query));
    if (!ready) {
      setPersonMatches([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(
        `/api/people/search?q=${encodeURIComponent(query)}&limit=25&offset=0`,
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("Person search is unavailable.");
          return (await response.json()) as PersonSearchResponse;
        })
        .then((body) => setPersonMatches(body.entries ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setPersonMatches([]);
        });
    }, 150);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [personPickerOpen, personQuery]);

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

  const choosePerson = useCallback(
    (nextPersonId: string) => {
      router.push(
        profileResultsHref({ personId: nextPersonId, eventId, resultType }),
      );
      setPersonQuery("");
      setPersonPickerOpen(false);
    },
    [eventId, resultType, router],
  );

  const chooseResultType = (nextResultType: RankingType) => {
    router.replace(
      profileResultsHref({ personId, eventId, resultType: nextResultType }),
    );
  };

  const chooseEvent = (nextEventId: string) => {
    const nextResultType = nextEventId === "333mbf" ? "single" : resultType;
    router.replace(
      profileResultsHref({
        personId,
        eventId: nextEventId,
        resultType: nextResultType,
      }),
    );
  };

  const chooseTypedPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const match = personQuery.trim().match(/^\d{4}[a-z]{4}\d{2}$/i);
    if (match) choosePerson(match[0]);
  };

  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId);
  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    if (lastVisibleIndex >= entries.length - 16) loadMore();
  }, [entries.length, lastVisibleIndex, loadMore]);

  return (
    <>
      <header className="profileResultsHeader">
        <Link href={`/person/${personId}`} className="profileBackLink">
          Back to profile
        </Link>
        <h1>{event?.shortName ?? eventId} results</h1>
        <p>{personName}</p>
      </header>

      <section className="profileResultsControls" aria-label="Result controls">
        <form
          className="profileResultsPersonPicker"
          onSubmit={chooseTypedPerson}
        >
          <label htmlFor="profile-results-person">Person</label>
          <input
            id="profile-results-person"
            value={personQuery}
            onChange={(event) => {
              setPersonQuery(event.target.value);
              setPersonPickerOpen(true);
            }}
            onFocus={() => setPersonPickerOpen(true)}
            placeholder="Name or WCA ID"
          />
          {personPickerOpen && personMatches.length > 0 && (
            <ul
              className="profileResultsSuggestions"
              aria-label="Person matches"
            >
              {personMatches.map((person) => (
                <li key={person.personId}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choosePerson(person.personId)}
                  >
                    <strong>{person.name}</strong>
                    <span>{person.personId}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <label>
          Event
          <select
            value={eventId}
            onChange={(event) => chooseEvent(event.target.value)}
          >
            {WCA_EVENTS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.shortName}
              </option>
            ))}
          </select>
        </label>
        <div className="profileResultsType" aria-label="Result type">
          <button
            type="button"
            className={resultType === "single" ? "isActive" : ""}
            onClick={() => chooseResultType("single")}
          >
            Single
          </button>
          <button
            type="button"
            className={resultType === "average" ? "isActive" : ""}
            onClick={() => chooseResultType("average")}
            disabled={eventId === "333mbf"}
          >
            Average
          </button>
        </div>
      </section>

      <section className="profileResultsSummary" aria-live="polite">
        {loading
          ? "Loading results"
          : `${total.toLocaleString()} official results`}
      </section>

      {error ? <p className="profileResultsError">{error}</p> : null}
      {!loading && !error && total === 0 ? (
        <p className="profileResultsEmpty">
          No official results match this event and result type.
        </p>
      ) : null}
      <div
        ref={listRef}
        className="profileResultsScroller"
        onScroll={(event) => {
          const target = event.currentTarget;
          if (
            target.scrollTop + target.clientHeight >=
            target.scrollHeight - 600
          ) {
            loadMore();
          }
        }}
      >
        <ol
          className="profileResultsList"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualRows.map((virtualRow) => {
            const entry = entries[virtualRow.index];
            if (!entry) {
              return (
                <li
                  key={virtualRow.key}
                  className="profileResultsRow profileResultsRow--loading"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  Loading results
                </li>
              );
            }
            return (
              <li
                key={entry.resultId + (entry.attemptNumber ?? 0)}
                className="profileResultsRow"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <span className="profileResultsRank">#{entry.rank}</span>
                <span className="profileResultsValue">
                  <strong>
                    {entry.formattedValue ||
                      formatWcaResult(eventId, entry.resultValue, resultType)}
                  </strong>
                  {entry.attemptNumber !== null && (
                    <small>Attempt {entry.attemptNumber}</small>
                  )}
                </span>
                <span className="profileResultsCompetition">
                  <strong>{entry.competitionName}</strong>
                  <small>{formatDate(entry.competitionStartDate)}</small>
                </span>
                {entry.recordCode && (
                  <span className="profileResultsRecord">
                    {entry.recordCode}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {loadingMore && (
          <p className="profileResultsLoadingMore">Loading more results</p>
        )}
      </div>
    </>
  );
}
