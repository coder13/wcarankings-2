"use client";

import { RankingRow } from "../RankingRow/RankingRow";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import type { Key, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonEventDetails } from "@/lib/person-event-details";
import { personDetailsCache } from "./personDetailsCache";

const DETAIL_PREFETCH_DELAY_MS = 120;
const ROW_REARRANGE_TRANSITION_MS = 220;

export type RenderedTableRow = {
  index: number;
  key: Key;
  start: number;
  size?: number;
};

export function getRenderedRowIdentity(
  entry: RankingEntry | null,
  index: number,
  hasMore: boolean,
) {
  if (entry) return rankingEntryKey(entry);
  return `placeholder:${index}:${hasMore ? "more" : "end"}`;
}

function renderedRowKeysEqual(
  left: ReadonlyMap<number, string>,
  right: ReadonlyMap<number, string>,
) {
  if (left.size !== right.size) return false;
  for (const [index, key] of right) {
    if (left.get(index) !== key) return false;
  }
  return true;
}

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
  const activeExpandedKey = focusedExpansionKey || expandedKey;
  const [previousRenderedKeys, setPreviousRenderedKeys] = useState<ReadonlyMap<number, string>>(() => new Map());
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
    if (focusedExpansionKey && focusedExpansionKey !== expandedKey) {
      // Sync the externally requested expansion into local interaction state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedKey(focusedExpansionKey);
    }
  }, [expandedKey, focusedExpansionKey]);

  const toggleEntryDetails = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const next = activeExpandedKey === key ? "" : key;
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
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "Could not load this competitor.");
        }
        return response.json() as Promise<PersonEventDetails>;
      })
      .then(() => {
        setDetailErrorByKey((current) => {
          const { [key]: _removed, ...next } = current;
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

  const currentRenderedKeys = useMemo(() => {
    const nextKeys = new Map<number, string>();
    for (const virtualRow of renderedRows) {
      nextKeys.set(
        virtualRow.index,
        getRenderedRowIdentity(entries[virtualRow.index] ?? null, virtualRow.index, hasMore),
      );
    }
    return nextKeys;
  }, [entries, hasMore, renderedRows]);

  const renderedRowStates = renderedRows.map((virtualRow) => {
    const entry = entries[virtualRow.index] ?? null;
    const identity = getRenderedRowIdentity(entry, virtualRow.index, hasMore);
    return {
      virtualRow,
      entry,
      identity,
      shouldAnimate: previousRenderedKeys.get(virtualRow.index) !== undefined &&
        previousRenderedKeys.get(virtualRow.index) !== identity,
    };
  });

  useEffect(() => {
    if (renderedRowKeysEqual(previousRenderedKeys, currentRenderedKeys)) return;
    const timer = window.setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviousRenderedKeys(currentRenderedKeys);
    }, ROW_REARRANGE_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [currentRenderedKeys, previousRenderedKeys]);

  if (loading && showLoading && !preserveListDuringLoad && entries.length === 0) {
    return <div className="listMessage">Loading rankings…</div>;
  }

  return (
    <MotionConfig reducedMotion="user">
      <ol
        ref={listRef}
        className="list"
        style={{ height: `${renderedListHeight}px` }}
      >
      {renderedRowStates.map(({ virtualRow, entry, identity, shouldAnimate }) => {
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
              closing={false}
              skipAccordionAnimation={Boolean(initialExpandedPersonId && focusedExpansionKey === key)}
              eventDetails={detailsByKey[key] ?? null}
              onPrefetchDetails={enablePersonDetails ? prefetchDetails : undefined}
              onCancelPrefetchDetails={enablePersonDetails ? cancelPrefetchDetails : undefined}
              detailsError={detailErrorByKey[key] ?? ""}
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
            data-expanded={entry ? activeExpandedKey === rankingEntryKey(entry) : false}
            data-highlighted={entry ? rankingEntryKey(entry) === highlightedPersonId : false}
            data-alternate={entry ? virtualRow.index % 2 === 1 : false}
            data-details-loading={entry ? loadingKey === rankingEntryKey(entry) : false}
            style={{
              height: entry || virtualRow.size === undefined ? undefined : `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - listOffset}px)`,
            }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={identity}
                className="virtualRowContent"
                initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {content}
              </motion.div>
            </AnimatePresence>
          </div>
        );
      })}
      </ol>
    </MotionConfig>
  );}
