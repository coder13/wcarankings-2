"use client";

import { RankingRow } from "../RankingRow/RankingRow";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";
import { animate } from "motion";
import type { Key, Ref } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonEventDetails } from "@/lib/person-event-details";
import { personDetailsCache } from "./personDetailsCache";

const ACCORDION_TRANSITION_SECONDS = 0.2;
const DETAIL_PREFETCH_DELAY_MS = 120;
const ROW_HEIGHT = 65.45;
const EXPANDED_ROW_HEIGHT = 248;

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
  const [animatedKeys, setAnimatedKeys] = useState<ReadonlySet<string>>(new Set());
  const animationControlsRef = useRef<{ stop: () => void } | null>(null);
  const rowSizesRef = useRef(new Map<string, number>());
  const animationKeysRef = useRef<ReadonlySet<string>>(new Set());
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

    const keys = new Set(animationKeysRef.current);
    if (previousKey) keys.add(previousKey);
    if (activeExpandedKey) keys.add(activeExpandedKey);
    const animatedKeyList = [...keys];
    animationKeysRef.current = keys;
    setAnimatedKeys(keys);
    setClosingKeys(new Set(animatedKeyList.filter((key) => key !== activeExpandedKey)));

    const indexes = new Map(
      entries.map((entry, index) => [rankingEntryKey(entry), index]),
    );
    const starts = new Map<string, number>();
    const targets = new Map<string, number>();
    for (const key of animatedKeyList) {
      starts.set(
        key,
        rowSizesRef.current.get(
          key,
        ) ?? (key === previousKey ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT),
      );
      targets.set(key, key === activeExpandedKey ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT);
    }

    animationControlsRef.current?.stop();
    const controls = animate(0, 1, {
      duration: ACCORDION_TRANSITION_SECONDS,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (progress) => {
        for (const key of animatedKeyList) {
          const index = indexes.get(key);
          if (index === undefined) continue;
          const size = (starts.get(key) ?? ROW_HEIGHT) +
            ((targets.get(key) ?? ROW_HEIGHT) - (starts.get(key) ?? ROW_HEIGHT)) * progress;
          rowSizesRef.current.set(key, size);
          resizeRow?.(index, size);
        }
      },
      onComplete: () => {
        for (const key of animatedKeyList) {
          const index = indexes.get(key);
          const size = targets.get(key) ?? ROW_HEIGHT;
          rowSizesRef.current.set(key, size);
          if (index !== undefined) resizeRow?.(index, size);
        }
        animationControlsRef.current = null;
        animationKeysRef.current = new Set();
        setAnimatedKeys(new Set());
        setClosingKeys(new Set());
      },
    });
    animationControlsRef.current = controls;
    return () => {
      if (previousKey !== activeExpandedKey) controls.stop();
    };
  }, [activeExpandedKey, enablePersonDetails, entries, resizeRow]);

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
              closing={closingKeys.has(key)}
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
            data-expanded={entry ? activeExpandedKey === rankingEntryKey(entry) || closingKeys.has(rankingEntryKey(entry)) : false}
            data-highlighted={entry ? rankingEntryKey(entry) === highlightedPersonId : false}
            data-alternate={entry ? virtualRow.index % 2 === 1 : false}
            data-accordion-measure-lock={entry && animatedKeys.has(rankingEntryKey(entry)) ? "true" : undefined}
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
