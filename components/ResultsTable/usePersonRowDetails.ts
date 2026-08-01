"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { animate } from "motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonEventDetails } from "@/lib/person-event-details";
import {
  EXPANDED_RANKING_ROW_HEIGHT as EXPANDED_ROW_HEIGHT,
  RANKING_ROW_HEIGHT as ROW_HEIGHT,
} from "../RankingsExplorer/rankingLayout";
import {
  rankingEntryKey,
  type RankingEntry,
} from "../RankingsExplorer/types";

const ACCORDION_TRANSITION_SECONDS = 0.2;
const DETAIL_PREFETCH_DELAY_MS = 120;
const PERSON_DETAILS_STALE_TIME_MS = 5 * 60_000;

function personDetailsQueryKey(personId: string, eventId: string) {
  return ["person-event-details", personId, eventId] as const;
}

async function fetchPersonEventDetails(
  personId: string,
  eventId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/people/${encodeURIComponent(personId)}/event/${encodeURIComponent(eventId)}`,
    { headers: { Accept: "application/json" }, signal },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Could not load this competitor.");
  }
  return response.json() as Promise<PersonEventDetails>;
}

type PersonRowDetailsOptions = {
  entries: RankingEntry[];
  eventId: string;
  rankingType: "single" | "average";
  enabled: boolean;
  initialExpandedPersonId: string;
  onFocusedPersonChange?: (personId: string | null) => void;
  resizeRow?: (index: number, size: number) => void;
};

export function usePersonRowDetails({
  entries,
  eventId,
  rankingType,
  enabled,
  initialExpandedPersonId,
  onFocusedPersonChange,
  resizeRow,
}: PersonRowDetailsOptions) {
  const queryClient = useQueryClient();
  const detailContextKey = `${eventId}:${rankingType}:${enabled}`;
  const [localExpansion, setLocalExpansion] = useState({
    contextKey: detailContextKey,
    key: "",
  });
  const expandedKey = localExpansion.contextKey === detailContextKey
    ? localExpansion.key
    : "";
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(new Set());
  const [animatedKeys, setAnimatedKeys] = useState<ReadonlySet<string>>(new Set());
  const animationControlsRef = useRef<{ stop: () => void } | null>(null);
  const rowSizesRef = useRef(new Map<string, number>());
  const animationKeysRef = useRef<ReadonlySet<string>>(new Set());
  const thumbRequestedKeys = useRef(new Set<string>());
  const prefetchTimersRef = useRef(new Map<string, number>());

  const focusedExpansionKey = useMemo(() => {
    if (!enabled || !initialExpandedPersonId) return "";
    const entry = entries.find(
      (candidate) =>
        candidate.personId === initialExpandedPersonId ||
        rankingEntryKey(candidate) === initialExpandedPersonId,
    );
    return entry ? rankingEntryKey(entry) : "";
  }, [enabled, entries, initialExpandedPersonId]);
  const activeExpandedKey = focusedExpansionKey || expandedKey;
  const previousExpandedKeyRef = useRef(activeExpandedKey);
  const activeExpandedEntry = activeExpandedKey
    ? entries.find((entry) => rankingEntryKey(entry) === activeExpandedKey) ?? null
    : null;
  const detailsQuery = useQuery({
    queryKey: personDetailsQueryKey(activeExpandedEntry?.personId ?? "", eventId),
    queryFn: ({ signal }) => fetchPersonEventDetails(
      activeExpandedEntry!.personId,
      eventId,
      signal,
    ),
    enabled: enabled && Boolean(activeExpandedEntry),
    staleTime: PERSON_DETAILS_STALE_TIME_MS,
  });
  const expandedDetails = detailsQuery.data ?? null;
  let expandedError = "";
  if (detailsQuery.error instanceof Error) {
    expandedError = detailsQuery.error.message;
  } else if (detailsQuery.isError) {
    expandedError = "Could not load this competitor.";
  }

  const prefetchDetails = useCallback((entry: RankingEntry) => {
    if (!enabled) return;
    const key = rankingEntryKey(entry);
    const queryKey = personDetailsQueryKey(entry.personId, eventId);
    if (queryClient.getQueryData(queryKey)) return;
    const existingTimer = prefetchTimersRef.current.get(key);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      prefetchTimersRef.current.delete(key);
      void queryClient.prefetchQuery({
        queryKey,
        queryFn: ({ signal }) => fetchPersonEventDetails(
          entry.personId,
          eventId,
          signal,
        ),
        staleTime: PERSON_DETAILS_STALE_TIME_MS,
      });
    }, DETAIL_PREFETCH_DELAY_MS);
    prefetchTimersRef.current.set(key, timer);
  }, [enabled, eventId, queryClient]);

  const cancelPrefetchDetails = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const timer = prefetchTimersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    prefetchTimersRef.current.delete(key);
  }, []);

  useEffect(() => () => {
    for (const timer of prefetchTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    prefetchTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const previousKey = previousExpandedKeyRef.current;
    if (previousKey === activeExpandedKey) return;
    previousExpandedKeyRef.current = activeExpandedKey;

    const keys = new Set(animationKeysRef.current);
    if (previousKey) keys.add(previousKey);
    if (activeExpandedKey) keys.add(activeExpandedKey);
    const animatedKeyList = [...keys];
    animationKeysRef.current = keys;
    setAnimatedKeys(keys);
    setClosingKeys(
      new Set(animatedKeyList.filter((key) => key !== activeExpandedKey)),
    );

    const indexes = new Map(
      entries.map((entry, index) => [rankingEntryKey(entry), index]),
    );
    const starts = new Map<string, number>();
    const targets = new Map<string, number>();
    for (const key of animatedKeyList) {
      starts.set(
        key,
        rowSizesRef.current.get(key) ??
          (key === previousKey ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT),
      );
      targets.set(
        key,
        key === activeExpandedKey ? EXPANDED_ROW_HEIGHT : ROW_HEIGHT,
      );
    }

    animationControlsRef.current?.stop();
    const controls = animate(0, 1, {
      duration: ACCORDION_TRANSITION_SECONDS,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (progress) => {
        for (const key of animatedKeyList) {
          const index = indexes.get(key);
          if (index === undefined) continue;
          const start = starts.get(key) ?? ROW_HEIGHT;
          const target = targets.get(key) ?? ROW_HEIGHT;
          const size = start + (target - start) * progress;
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
  }, [activeExpandedKey, enabled, entries, resizeRow]);

  const toggle = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const next = activeExpandedKey === key ? "" : key;
    setLocalExpansion({ contextKey: detailContextKey, key: next });
    onFocusedPersonChange?.(next ? entry.personId : null);
  }, [activeExpandedKey, detailContextKey, onFocusedPersonChange]);

  useEffect(() => {
    const details = expandedDetails;
    if (
      !details ||
      !activeExpandedKey ||
      thumbRequestedKeys.current.has(activeExpandedKey)
    ) return;
    const key = activeExpandedKey;
    thumbRequestedKeys.current.add(key);
    const source = new EventSource(
      `/api/people/${encodeURIComponent(details.person.id)}/thumb`,
    );
    source.addEventListener("thumb", (event) => {
      const body = JSON.parse((event as MessageEvent).data) as {
        avatarUrl?: string | null;
      };
      const avatarUrl = body.avatarUrl;
      if (!avatarUrl) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        queryClient.setQueryData<PersonEventDetails>(
          personDetailsQueryKey(details.person.id, eventId),
          (current) => current
            ? { ...current, person: { ...current.person, avatarUrl } }
            : current,
        );
      };
      image.src = avatarUrl;
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [activeExpandedKey, eventId, expandedDetails, queryClient]);

  return {
    activeExpandedKey,
    animatedKeys,
    closingKeys,
    details: expandedDetails,
    error: expandedError,
    focusedExpansionKey,
    pending: detailsQuery.isPending,
    prefetch: prefetchDetails,
    cancelPrefetch: cancelPrefetchDetails,
    toggle,
  };
}
