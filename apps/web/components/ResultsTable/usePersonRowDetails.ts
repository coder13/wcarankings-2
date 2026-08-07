"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { PersonEventDetails } from "@/lib/person-event-details";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";

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
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "Could not load this competitor.");
  }
  return response.json() as Promise<PersonEventDetails>;
}

export function usePersonRowDetails({
  activeEntry,
  eventId,
  enabled,
}: {
  activeEntry: RankingEntry | null;
  eventId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const thumbRequestedKeys = useRef(new Set<string>());
  const prefetchTimersRef = useRef(new Map<string, number>());
  const detailsQuery = useQuery({
    queryKey: personDetailsQueryKey(activeEntry?.personId ?? "", eventId),
    queryFn: ({ signal }) =>
      fetchPersonEventDetails(activeEntry!.personId, eventId, signal),
    enabled: enabled && Boolean(activeEntry),
    staleTime: PERSON_DETAILS_STALE_TIME_MS,
  });

  const prefetch = useCallback(
    (entry: RankingEntry) => {
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
          queryFn: ({ signal }) =>
            fetchPersonEventDetails(entry.personId, eventId, signal),
          staleTime: PERSON_DETAILS_STALE_TIME_MS,
        });
      }, DETAIL_PREFETCH_DELAY_MS);
      prefetchTimersRef.current.set(key, timer);
    },
    [enabled, eventId, queryClient],
  );

  const cancelPrefetch = useCallback((entry: RankingEntry) => {
    const key = rankingEntryKey(entry);
    const timer = prefetchTimersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    prefetchTimersRef.current.delete(key);
  }, []);

  useEffect(
    () => () => {
      for (const timer of prefetchTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      prefetchTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const details = detailsQuery.data;
    if (!details || !activeEntry) return;
    const key = rankingEntryKey(activeEntry);
    if (thumbRequestedKeys.current.has(key)) return;
    thumbRequestedKeys.current.add(key);
    const source = new EventSource(
      `/api/people/${encodeURIComponent(details.person.id)}/thumb`,
    );
    source.addEventListener("thumb", (event) => {
      const body = JSON.parse((event as MessageEvent).data) as {
        avatarUrl?: string | null;
      };
      if (!body.avatarUrl) return;
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        queryClient.setQueryData<PersonEventDetails>(
          personDetailsQueryKey(details.person.id, eventId),
          (current) =>
            current
              ? {
                  ...current,
                  person: { ...current.person, avatarUrl: body.avatarUrl! },
                }
              : current,
        );
      };
      image.src = body.avatarUrl;
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [activeEntry, detailsQuery.data, eventId, queryClient]);

  let error = "";
  if (detailsQuery.error instanceof Error) error = detailsQuery.error.message;
  else if (detailsQuery.isError) error = "Could not load this competitor.";

  return {
    details: detailsQuery.data ?? null,
    error,
    pending: detailsQuery.isPending,
    prefetch,
    cancelPrefetch,
  };
}
