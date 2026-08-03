"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trackGoogleAnalyticsEvent } from "@/lib/helpers/analytics/google-analytics";
import { orderSearchMatches } from "./helpers/search";
import type { PatchRankingsFilters } from "./useRankingsState";
import type { RankingEntry } from "./types";

type SearchRequest = (
  query: string,
  regex: boolean,
  signal: AbortSignal,
) => Promise<{ entries: RankingEntry[] }>;

type RankingsSearchOptions = {
  query: string;
  regexSearch: boolean;
  requestKey: string;
  request: SearchRequest;
  onMatch: (
    match: RankingEntry,
    direction?: -1 | 1,
    currentMatch?: RankingEntry | null,
  ) => void;
  onReset: () => void;
  onPrefetch?: (matches: RankingEntry[], index: number) => void;
  patchFilters: PatchRankingsFilters;
};

export function useRankingsSearch({
  query,
  regexSearch,
  requestKey,
  request,
  onMatch,
  onReset,
  onPrefetch,
  patchFilters,
}: RankingsSearchOptions) {
  const [openRequested, setOpen] = useState(
    Boolean(query.trim() && !regexSearch),
  );
  const normalizedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(normalizedQuery);
  const [selection, setSelection] = useState({
    resultKey: "",
    index: -1,
  });
  const handledResultKeyRef = useRef("");
  const previousRequestKeyRef = useRef(requestKey);
  const preserveResetRef = useRef(false);

  useEffect(() => {
    if (!normalizedQuery) return;
    const timeout = window.setTimeout(
      () => setDebouncedQuery(normalizedQuery),
      800,
    );
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery]);
  const activeDebouncedQuery = normalizedQuery ? debouncedQuery : "";

  const queryResult = useQuery({
    queryKey: [
      "rankings",
      "search",
      requestKey,
      regexSearch ? "regex" : "text",
      activeDebouncedQuery,
    ],
    queryFn: ({ signal }) => request(activeDebouncedQuery, regexSearch, signal),
    enabled: Boolean(
      activeDebouncedQuery && activeDebouncedQuery === normalizedQuery,
    ),
    staleTime: 60_000,
  });
  const matches = useMemo(
    () => activeDebouncedQuery === normalizedQuery && queryResult.data
      ? orderSearchMatches(queryResult.data.entries)
      : [],
    [activeDebouncedQuery, normalizedQuery, queryResult.data],
  );
  const resultKey = queryResult.dataUpdatedAt
    ? `${requestKey}:${regexSearch}:${activeDebouncedQuery}:${queryResult.dataUpdatedAt}`
    : "";
  let index = matches.length ? 0 : -1;
  if (selection.resultKey === resultKey) {
    index = Math.min(selection.index, matches.length - 1);
  }

  const patchSearch = useCallback((patch: {
    search?: string;
    regexSearch?: boolean;
  }) => {
    patchFilters(patch);
  }, [patchFilters]);

  const reset = useCallback(() => {
    patchSearch({ search: "", regexSearch: false });
    setDebouncedQuery("");
    setSelection({ resultKey: "", index: -1 });
    onReset();
  }, [onReset, patchSearch]);

  const close = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  const activate = useCallback(() => {
    if (regexSearch) reset();
    patchSearch({ regexSearch: false });
    setOpen(true);
  }, [patchSearch, regexSearch, reset]);

  const changeQuery = useCallback((value: string) => {
    if (!query.trim() && value.trim()) {
      trackGoogleAnalyticsEvent("ranking_search_used", {
        search_mode: "standard",
      });
    }
    if (value !== query) onReset();
    if (!value.trim()) setDebouncedQuery("");
    patchSearch({ search: value, regexSearch: false });
  }, [onReset, patchSearch, query]);

  const startRegexSearch = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    trackGoogleAnalyticsEvent("ranking_search_used", { search_mode: "vim" });
    onReset();
    patchSearch({ search: normalized, regexSearch: true });
    setOpen(false);
  }, [onReset, patchSearch]);

  const cycle = useCallback((direction: -1 | 1 = 1) => {
    if (!matches.length) return;
    const currentMatch = index >= 0 ? matches[index] : null;
    let nextIndex = (index + direction + matches.length) % matches.length;
    if (index < 0) nextIndex = direction > 0 ? 0 : matches.length - 1;
    const nextMatch = matches[nextIndex];
    if (!nextMatch) return;
    setSelection({ resultKey, index: nextIndex });
    onPrefetch?.(matches, nextIndex);
    onMatch(nextMatch, direction, currentMatch);
  }, [index, matches, onMatch, onPrefetch, resultKey]);

  const preserveOnNextRequest = useCallback(() => {
    preserveResetRef.current = true;
  }, []);

  useEffect(() => {
    if (previousRequestKeyRef.current === requestKey) return;
    previousRequestKeyRef.current = requestKey;
    const preserveReset = preserveResetRef.current;
    preserveResetRef.current = false;
    if (!preserveReset && normalizedQuery) onReset();
  }, [normalizedQuery, onReset, requestKey]);

  useEffect(() => {
    if (
      !matches.length ||
      activeDebouncedQuery !== normalizedQuery ||
      handledResultKeyRef.current === resultKey
    ) return;
    handledResultKeyRef.current = resultKey;
    onPrefetch?.(matches, 0);
    onMatch(matches[0]);
  }, [
    activeDebouncedQuery,
    matches,
    normalizedQuery,
    onMatch,
    onPrefetch,
    resultKey,
  ]);

  const open = openRequested || Boolean(query.trim() && !regexSearch);
  const pending = Boolean(normalizedQuery) && (
    activeDebouncedQuery !== normalizedQuery || queryResult.isFetching
  );
  let error = "";
  if (queryResult.error instanceof Error) error = queryResult.error.message;
  else if (queryResult.isError) error = "Search is unavailable.";
  const matchPersonIds = useMemo(
    () => new Set(matches.map((match) => match.personId)),
    [matches],
  );

  const state = useMemo(() => ({
      query,
      regexSearch,
      open,
      matches,
      index,
      loading: queryResult.isFetching,
      pending,
      error,
      activeMatch: matches[index] ?? null,
      matchPersonIds,
    }), [
      error,
      index,
      matchPersonIds,
      matches,
      open,
      pending,
      query,
      queryResult.isFetching,
      regexSearch,
    ]);
  const actions = useMemo(() => ({
      activate,
      changeQuery,
      close,
      cycle,
      reset,
      setOpen,
      startRegexSearch,
      preserveOnNextRequest,
    }), [
      activate,
      changeQuery,
      close,
      cycle,
      preserveOnNextRequest,
      reset,
      startRegexSearch,
    ]);

  return useMemo(() => ({ state, actions }), [actions, state]);
}
