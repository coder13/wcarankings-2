"use client";

import { RankingRow } from "../RankingRow/RankingRow";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";
import type { Key, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonEventDetails } from "@/lib/person-event-details";
import { personDetailsCache } from "./personDetailsCache";

const DETAIL_PREFETCH_DELAY_MS = 120;

export type RenderedTableRow = {
  index: number;
  key: Key;
  start: number;
  size?: number;
};

export function ResultsTable({
  entries,
  listRef,
  renderedRows,
  renderedListHeight,
  listOffset,
  eventId,
  rankingType,
  hideIdentityIds = false,
  loading,
  showLoading,
  preserveListDuringLoad,
  hasMore,
  loadingMore,
  highlightedPersonId,
  searchMatchPersonIds,
  measureElement,
  resizeRow,
  onRowNavigate,
  memberSelectionMode,
  selectedMemberIds,
  onMemberToggle,
  onMemberContextMenu,
  enablePersonDetails = false,
  initialExpandedPersonId = "",
  onFocusedPersonChange,
}: {
  entries: RankingEntry[];
  listRef?: Ref<HTMLOListElement>;
  renderedRows: RenderedTableRow[];
  renderedListHeight: number;
  listOffset: number;
  eventId: string;
  rankingType: "single" | "average";
  hideIdentityIds?: boolean;
  loading: boolean;
  showLoading: boolean;
  preserveListDuringLoad: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  highlightedPersonId: string;
  searchMatchPersonIds?: ReadonlySet<string>;
  measureElement: (element: Element | null) => void;
  resizeRow?: (index: number, size: number) => void;
  onRowNavigate: (rowIndex: number, direction: -1 | 1) => void;
  memberSelectionMode?: boolean;
  selectedMemberIds?: ReadonlySet<string>;
  onMemberToggle?: (personId: string) => void;
  onMemberContextMenu?: (entry: RankingEntry, position: { x: number; y: number }) => void;
  enablePersonDetails?: boolean;
  initialExpandedPersonId?: string;
  onFocusedPersonChange?: (personId: string | null) => void;
}) {
  const [expandedKey, setExpandedKey] = useState("");
  const [detailsByKey, setDetailsByKey] = useState<Record<string, PersonEventDetails | null>>({});
  const [loadingKey, setLoadingKey] = useState("");
  const [detailErrorByKey, setDetailErrorByKey] = useState<Record<string, string>>({});
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(new Set());
  const thumbRequestedKeys = useRef(new Set<string>());
  const detailRequestsRef = useRef(new Map<string, Promise<PersonEventDetails>>());
  const prefetchTimersRef = useRef(new Map<string, number>());
  const focusedExpansionKey = useMemo(() => {
    if (!enablePersonDetails || !initialExpandedPersonId) return "";
    const entry = entries.find(
      (candidate) =>
        candidate.personId === initialExpandedPersonId ||
        rankingEntryKey(candidate) === initialExpandedPersonId
    );
    return entry ? rankingEntryKey(entry) : "";
  }, [enablePersonDetails, entries, initialExpandedPersonId]);
  const [initialExpansionKey, setInitialExpansionKey] = useState(focusedExpansionKey);
  const activeExpandedKey = focusedExpansionKey || expandedKey;
  const previousExpandedKeyRef = useRef(activeExpandedKey);
  const expandedDetails = activeExpandedKey ? detailsByKey[activeExpandedKey] : null;
  const expandedError = activeExpandedKey ? detailErrorByKey[activeExpandedKey] : "";

  const requestDetails = useCallback((entry: RankingEntry, key: string) => {
    const cacheKey = `${entry.personId}:${eventId}`;
    const cached = detailsByKey[key] ?? personDetailsCache.get(cacheKey);
    if (cached) {
      setDetailsByKey((current) => current[key] ? current : { ...current, [key]: cached });
      return Promise.resolve(cached);
    }
    const existing = detailRequestsRef.current.get(cacheKey);
    if (existing) return existing;

    const request = fetch(`/api/people/${encodeURIComponent(entry.personId)}/event/${encodeURIComponent(eventId)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Could not load this competitor.");
        }
        return response.json() as Promise<PersonEventDetails>;
      })
      .then((details) => {
        personDetailsCache.set(cacheKey, details);
        setDetailsByKey((current) => ({ ...current, [key]: details }));
        return details;
      });
    detailRequestsRef.current.set(cacheKey, request);
    const cleanup = () => {
      if (detailRequestsRef.current.get(cacheKey) === request) detailRequestsRef.current.delete(cacheKey);
    };
    request.then(cleanup, cleanup);
    return request;
  }, [detailsByKey, eventId]);

  const prefetchDetails = useCallback((entry: RankingEntry) => {
    if (!enablePersonDetails) return;
    const key = rankingEntryKey(entry);
    const cacheKey = `${entry.personId}:${eventId}`;
    if (detailsByKey[key] || personDetailsCache.get(cacheKey) || detailRequestsRef.current.has(cacheKey)) return;
    const existingTimer = prefetchTimersRef.current.get(key);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      prefetchTimersRef.current.delete(key);
      void requestDetails(entry, key).catch(() => undefined);
    }, DETAIL_PREFETCH_DELAY_MS);
    prefetchTimersRef.current.set(key, timer);
  }, [detailsByKey, enablePersonDetails, eventId, requestDetails]);

  const cancelPrefetchDetails = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const timer = prefetchTimersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    prefetchTimersRef.current.delete(key);
  }, []);

  useEffect(() => () => {
    for (const timer of prefetchTimersRef.current.values()) window.clearTimeout(timer);
    prefetchTimersRef.current.clear();
  }, []);

  useEffect(() => {
    // These caches intentionally reset when the ranking context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetailsByKey({});
    setDetailErrorByKey({});
    if (!enablePersonDetails) setExpandedKey("");
  }, [enablePersonDetails, eventId, rankingType]);

  useEffect(() => {
    if (!enablePersonDetails) return;
    const previousKey = previousExpandedKeyRef.current;
    if (previousKey === activeExpandedKey) return;
    previousExpandedKeyRef.current = activeExpandedKey;
    // Keep an externally replaced expansion mounted until its own pane reports
    // that the closing height animation is complete.
    setClosingKeys((current) => {
      const next = new Set(current);
      if (activeExpandedKey) next.delete(activeExpandedKey);
      if (previousKey) next.add(previousKey);
      return next;
    });
  }, [activeExpandedKey, enablePersonDetails]);

  useEffect(() => {
    if (focusedExpansionKey && focusedExpansionKey !== expandedKey) {
      // Sync the externally requested expansion into local interaction state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedKey(focusedExpansionKey);
    }
  }, [expandedKey, focusedExpansionKey]);

  const toggleEntryDetails = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const next = activeExpandedKey === key ? "" : key;
    // URL focus is also updated by row clicks. Consume the initial deep-link
    // exemption before changing it so cached user expansions still animate.
    setInitialExpansionKey("");
    // Keep the outgoing accordion mounted from the same render that changes
    // expansion state. Waiting for the sizing effect briefly starts an exit,
    // then remounts the pane as closing, which makes its contents jump.
    setClosingKeys(activeExpandedKey ? new Set([activeExpandedKey]) : new Set());
    setExpandedKey(next);
    onFocusedPersonChange?.(next ? entry.personId : null);
  }, [activeExpandedKey, onFocusedPersonChange]);

  useEffect(() => {
    if (!activeExpandedKey || expandedDetails || expandedError) return;
    const entry = entries.find((candidate) => rankingEntryKey(candidate) === activeExpandedKey);
    if (!entry) return;
    const key = activeExpandedKey;
    // Loading state begins as this effect starts the detail request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingKey(key);
    requestDetails(entry, key)
      .then(() => {
        setDetailErrorByKey((current) => {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        });
      })
      .catch((error: unknown) => {
        setDetailErrorByKey((current) => ({
          ...current,
          [key]: error instanceof Error ? error.message : "Could not load this competitor.",
        }));
      })
      .finally(() => {
        setLoadingKey((current) => current === key ? "" : current);
      });
  }, [activeExpandedKey, entries, expandedDetails, expandedError, requestDetails]);

  useEffect(() => {
    const details = expandedDetails;
    if (!details || !activeExpandedKey || thumbRequestedKeys.current.has(activeExpandedKey)) return;
    const key = activeExpandedKey;
    thumbRequestedKeys.current.add(key);
    const source = new EventSource(`/api/people/${encodeURIComponent(details.person.id)}/thumb`);
    source.addEventListener("thumb", (event) => {
      const body = JSON.parse((event as MessageEvent).data) as { avatarUrl?: string | null };
      if (!body.avatarUrl) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        setDetailsByKey((current) => ({
          ...current,
          [key]: current[key] === null || current[key] === undefined
            ? current[key]
            : { ...current[key], person: { ...current[key].person, avatarUrl: body.avatarUrl } },
        }));
      };
      image.src = body.avatarUrl;
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [activeExpandedKey, expandedDetails]);

  if (loading && showLoading && !preserveListDuringLoad && entries.length === 0) {
    return <div className="listMessage">Loading rankings…</div>;
  }

  return (
    <ol
      ref={listRef}
      className="list"
      style={{ height: `${renderedListHeight}px` }}
    >
      {renderedRows.map((virtualRow) => {
        const entry = entries[virtualRow.index] ?? null;
        let content;

        if (entry) {
          const key = rankingEntryKey(entry);
          const expanded = activeExpandedKey === key;
          content = (
            <RankingRow
              entry={entry}
              eventId={eventId}
              rankingType={rankingType}
              hideIdentityId={hideIdentityIds}
              animationIndex={virtualRow.index}
              searchMatched={searchMatchPersonIds?.has(key)}
              highlighted={key === highlightedPersonId}
              rankIsDuplicate={
                virtualRow.index > 0 &&
                entries[virtualRow.index - 1]?.rank === entry.rank
              }
              rowIndex={virtualRow.index}
              onNavigate={onRowNavigate}
              selectionMode={memberSelectionMode}
              selected={selectedMemberIds?.has(entry.personId)}
              onToggleSelected={onMemberToggle}
              onMemberContextMenu={onMemberContextMenu}
              expanded={expanded}
              closing={!expanded && closingKeys.has(key)}
              skipAccordionAnimation={initialExpansionKey === key}
              eventDetails={detailsByKey[key] ?? null}
              onPrefetchDetails={enablePersonDetails ? prefetchDetails : undefined}
              onCancelPrefetchDetails={enablePersonDetails ? cancelPrefetchDetails : undefined}
              detailsError={detailErrorByKey[key] ?? ""}
              onHeightChange={resizeRow}
              onCloseComplete={() => {
                setClosingKeys((current) => {
                  if (!current.has(key)) return current;
                  const next = new Set(current);
                  next.delete(key);
                  return next;
                });
              }}
              onToggle={enablePersonDetails && !memberSelectionMode
                ? () => toggleEntryDetails(entry)
                : undefined}
            />
          );
        } else if (hasMore) {
          content = (
            <div className="listMessage">
              {loadingMore ? "Loading more results…" : "Keep scrolling…"}
            </div>
          );
        } else {
          content = <div className="listMessage">That’s all, folks</div>;
        }

        return (
          <div
            ref={measureElement}
            className="virtualRow"
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-expanded={entry ? activeExpandedKey === rankingEntryKey(entry) || closingKeys.has(rankingEntryKey(entry)) : false}
            data-highlighted={entry ? rankingEntryKey(entry) === highlightedPersonId : false}
            data-alternate={entry ? virtualRow.index % 2 === 1 : false}
            data-accordion-measure-lock={entry && (activeExpandedKey === rankingEntryKey(entry) || closingKeys.has(rankingEntryKey(entry))) ? "true" : undefined}
            data-details-loading={entry ? loadingKey === rankingEntryKey(entry) : false}
            style={{
              height: virtualRow.size === undefined ? undefined : `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - listOffset}px)`,
            }}
          >
            {content}
          </div>
        );
      })}
    </ol>
  );
}
