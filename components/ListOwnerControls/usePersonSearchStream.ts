"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ListPerson, PersonSearchResponse } from "./shared";

const PAGE_SIZE = 25;

type SearchState = {
  query: string;
  entries: ListPerson[];
  total: number;
  offset: number;
  hasMore: boolean;
  loadingMore: boolean;
};

type SearchAction =
  | {
      type: "replace";
      query: string;
      response: PersonSearchResponse;
    }
  | {
      type: "append";
      query: string;
      offset: number;
      response: PersonSearchResponse;
    }
  | { type: "thumbs"; query: string; thumbs: Record<string, string | null> }
  | { type: "loadingMore"; query: string; value: boolean };

const emptySearchState = (query: string): SearchState => ({
  query,
  entries: [],
  total: 0,
  offset: 0,
  hasMore: false,
  loadingMore: false,
});

function reducer(state: SearchState, action: SearchAction): SearchState {
  if (action.query !== state.query && action.type !== "replace") return state;
  if (action.type === "replace") {
    return {
      query: action.query,
      entries: action.response.entries ?? [],
      total: action.response.total ?? 0,
      offset: 0,
      hasMore: Boolean(action.response.page?.hasMore),
      loadingMore: false,
    };
  }
  if (action.type === "append") {
    const existingIds = new Set(state.entries.map((person) => person.personId));
    const additions = action.response.entries.filter(
      (person) => !existingIds.has(person.personId),
    );
    return {
      ...state,
      entries: [...state.entries, ...additions],
      offset: action.offset,
      hasMore: Boolean(action.response.page?.hasMore),
    };
  }
  if (action.type === "thumbs") {
    return {
      ...state,
      entries: state.entries.map((person) => ({
        ...person,
        avatarUrl: action.thumbs[person.personId] ?? person.avatarUrl,
      })),
    };
  }
  return { ...state, loadingMore: action.value };
}

function isPersonSearchReady(value: string) {
  const trimmed = value.trim();
  const looksLikeWcaId = /^\d/.test(trimmed);
  const readyWcaId = /^\d{4}[A-Za-z]{2}/.test(trimmed);
  return (
    trimmed.length >= 2 &&
    !/[,\n]/.test(value) &&
    (!looksLikeWcaId || readyWcaId)
  );
}

function preloadThumbs(thumbs: Record<string, string | null>) {
  Object.values(thumbs).forEach((thumb) => {
    if (!thumb) return;
    const image = new Image();
    image.src = thumb;
  });
}

export function usePersonSearchStream(query: string, enabled: boolean) {
  const normalizedQuery = query.trim();
  const ready = enabled && isPersonSearchReady(query);
  const [state, dispatch] = useReducer(
    reducer,
    normalizedQuery,
    emptySearchState,
  );
  const visibleState =
    state.query === normalizedQuery ? state : emptySearchState(normalizedQuery);
  const sourcesRef = useRef(new Set<EventSource>());

  const openStream = useCallback(
    (offset: number, append: boolean) => {
      const source = new EventSource(
        `/api/people/search?q=${encodeURIComponent(normalizedQuery)}` +
          `&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      sourcesRef.current.add(source);
      source.addEventListener("results", (event) => {
        const body = JSON.parse((event as MessageEvent).data) as {
          data?: PersonSearchResponse;
        };
        const response = body.data ?? { entries: [] };
        dispatch(
          append
            ? { type: "append", query: normalizedQuery, offset, response }
            : { type: "replace", query: normalizedQuery, response },
        );
      });
      source.addEventListener("thumbs", (event) => {
        const thumbs = JSON.parse((event as MessageEvent).data) as Record<
          string,
          string | null
        >;
        preloadThumbs(thumbs);
        dispatch({ type: "thumbs", query: normalizedQuery, thumbs });
        if (append) {
          dispatch({
            type: "loadingMore",
            query: normalizedQuery,
            value: false,
          });
        }
        sourcesRef.current.delete(source);
        source.close();
      });
      source.onerror = () => {
        if (append) {
          dispatch({
            type: "loadingMore",
            query: normalizedQuery,
            value: false,
          });
        }
        sourcesRef.current.delete(source);
        source.close();
      };
    },
    [normalizedQuery],
  );

  useEffect(() => {
    if (!ready) return;
    const sources = sourcesRef.current;
    openStream(0, false);
    return () => {
      for (const source of sources) source.close();
      sources.clear();
    };
  }, [openStream, ready]);

  const loadMore = useCallback(() => {
    if (
      !ready ||
      !visibleState.hasMore ||
      visibleState.loadingMore ||
      visibleState.entries.length < visibleState.offset + PAGE_SIZE
    )
      return;
    dispatch({ type: "loadingMore", query: normalizedQuery, value: true });
    openStream(visibleState.offset + PAGE_SIZE, true);
  }, [normalizedQuery, openStream, ready, visibleState]);

  return { ...visibleState, ready, loadMore };
}
