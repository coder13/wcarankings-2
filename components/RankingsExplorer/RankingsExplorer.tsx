"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  animateScrollTo,
  cancelScrollAnimation,
  getCurrentViewportPosition,
  getCurrentViewportSubRank,
  getScrollAnimationDuration,
  getSearchAnimationDuration,
  getSearchBridgePageStarts,
  getSearchJumpMode,
  scrollToEntry,
  type ScrollAnimationState,
  SCROLL_SETTLE_DELAY_MS,
} from "./scrollEngine";
import {
  FALLBACK_CONTINENTS,
  FALLBACK_COUNTRIES,
  isEventId,
  isRankingType,
  parseRegionQuery,
  WCA_EVENTS,
} from "@/lib/wca";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  JumpDownControls,
  JumpUpControls,
} from "../JumpControls/JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";
import { RankingControls } from "../RankingControls/RankingControls";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { SearchInputs } from "../SearchInputs/SearchInputs";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { VimHelp } from "../VimHelp/VimHelp";
import { VimSearchInput } from "../VimSearchInput/VimSearchInput";
import {
  formatFetchedAgo,
  type InitialRankingData,
  type RankingEntry,
  type RankingPage,
  type RegionOption,
  type RegionSelection,
} from "./types";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const SEARCH_PAGE_RADIUS = 1;
const SEARCH_PREFETCH_RADIUS = 3;
const SEARCH_ANIMATION_ROWS = 3;
const VIM_JUMP_PAGE_COUNT = 2;
const VIM_JUMP_SIZE = PAGE_SIZE * VIM_JUMP_PAGE_COUNT;
const ROW_HEIGHT = 65.45;
const END_MARKER_PEEK = ROW_HEIGHT + 40;

export function centeredRowScrollTop(
  rowTop: number,
  viewportHeight: number,
  rowHeight = ROW_HEIGHT
) {
  return Math.max(
    0,
    rowTop - Math.max(0, (viewportHeight - rowHeight) / 2)
  );
}

export function getSearchScrollDirection(
  currentMatch: Pick<RankingEntry, "subRank"> | null,
  targetMatch: Pick<RankingEntry, "subRank">,
  fallbackDirection: -1 | 1
): -1 | 1 {
  if (!currentMatch || currentMatch.subRank === targetMatch.subRank)
    return fallbackDirection;
  return targetMatch.subRank > currentMatch.subRank ? 1 : -1;
}

export function areRankingWindowsContiguous(
  currentEntries: Array<Pick<RankingEntry, "subRank">>,
  incomingEntries: Array<Pick<RankingEntry, "subRank">>,
  direction: -1 | 1
) {
  const currentFirst = currentEntries[0]?.subRank;
  const currentLast = currentEntries.at(-1)?.subRank;
  const incomingFirst = incomingEntries[0]?.subRank;
  const incomingLast = incomingEntries.at(-1)?.subRank;
  if (
    currentFirst === undefined ||
    currentLast === undefined ||
    incomingFirst === undefined ||
    incomingLast === undefined
  )
    return false;
  return direction === 1
    ? currentLast + 1 === incomingFirst
    : incomingLast + 1 === currentFirst;
}

function updateQueryParams(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(updates).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}`
  );
}

function setSearchQueryParam(value: string) {
  updateQueryParams({ search: value.trim() ? value : null });
}

type SearchLayoutAnchor = {
  requestEpoch: number;
  personId: string;
  viewportTop: number;
};

type SearchSurface = "header" | "rail";

type PendingSearchFocusHandoff = {
  target: SearchSurface;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
};

const CLIENT_PAGE_CACHE_CAPACITY_333 = 512;
const CLIENT_PAGE_CACHE_CAPACITY_DEFAULT = 128;

type ClientPageCacheEntry = { request: Promise<RankingPage>; permanent: boolean };

class ClientPageCache {
  private readonly pools = new Map<string, Map<string, ClientPageCacheEntry>>();

  private pool(eventId: string) {
    let pool = this.pools.get(eventId);
    if (!pool) {
      pool = new Map();
      this.pools.set(eventId, pool);
    }
    return pool;
  }

  get(eventId: string, key: string) {
    const pool = this.pool(eventId);
    const entry = pool.get(key);
    if (!entry) return undefined;
    if (!entry.permanent) {
      pool.delete(key);
      pool.set(key, entry);
    }
    return entry.request;
  }

  set(eventId: string, key: string, request: Promise<RankingPage>, permanent: boolean) {
    const pool = this.pool(eventId);
    pool.set(key, { request, permanent });
    const capacity = eventId === "333"
      ? CLIENT_PAGE_CACHE_CAPACITY_333
      : CLIENT_PAGE_CACHE_CAPACITY_DEFAULT;
    while (pool.size > capacity) {
      const oldest = [...pool.entries()].find(([, entry]) => !entry.permanent);
      if (!oldest) break;
      pool.delete(oldest[0]);
    }
  }

  delete(eventId: string, key: string) {
    this.pool(eventId).delete(key);
  }
}

const pageCache = new ClientPageCache();

async function fetchRankingPage(input: RequestInfo | URL) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(input);
    } catch (error) {
      lastError = error;
      if (attempt === 0)
        await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Rankings are unavailable.");
}

function pageStartForSubRank(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE;
}

export function orderSearchMatches(
  matches: Array<RankingEntry | null | undefined>
) {
  return matches.filter((match): match is RankingEntry => Boolean(match)).sort(
    (left, right) =>
      left.subRank - right.subRank ||
      left.rank - right.rank ||
      left.personName.localeCompare(right.personName) ||
      left.personId.localeCompare(right.personId)
  );
}

function getPage(
  eventId: string,
  rankingType: "single" | "average",
  start: number,
  selection: RegionSelection
) {
  const pageStart = pageStartForSubRank(start);
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    start: String(pageStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  if (selection.scope !== "world") params.set("region", selection.regionId);
  const cacheKey = params.toString();
  const cached = pageCache.get(eventId, cacheKey);
  if (cached) return cached;

  const request = fetchRankingPage(`/api/rankings?${params}`).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Rankings are unavailable.");
    }
    const data = (await response.json()) as RankingPage;
    return {
      entries: data.entries,
      hasMore: data.hasMore,
      nextPageStart: data.nextPageStart,
      previousPageStart: data.previousPageStart,
      startPosition: data.startPosition,
      lastRank: data.lastRank,
      total: data.total,
      fetchedAt: data.fetchedAt ?? data.exportDate ?? null,
      offlineStale: response.headers.get("X-Rankings-Offline-Stale") === "1",
    };
  });

  pageCache.set(eventId, cacheKey, request, selection.scope === "world" && pageStart === 0);
  request.catch(() => pageCache.delete(eventId, cacheKey));
  return request;
}

async function getEndWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  endSubRank: number
) {
  const finalPageStart = pageStartForSubRank(endSubRank);
  const pageStarts = [
    Math.max(0, finalPageStart - PAGE_SIZE),
    finalPageStart,
  ].filter((start, index, starts) => starts.indexOf(start) === index);
  const pages = await Promise.all(
    pageStarts.map((start) =>
      getPage(eventId, rankingType, start + 1, selection)
    )
  );
  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  const seenPersonIds = new Set<string>();

  return {
    ...lastPage,
    entries: pages.flatMap((page) =>
      page.entries.filter((entry) => {
        if (seenPersonIds.has(entry.personId)) return false;
        seenPersonIds.add(entry.personId);
        return true;
      })
    ),
    startPosition: firstPage.startPosition,
    previousPageStart: firstPage.previousPageStart,
  };
}

async function getSearchWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  match: RankingEntry
) {
  const targetPageStart = pageStartForSubRank(match.subRank);
  const pageFirstSubRanks = Array.from(
    { length: SEARCH_PAGE_RADIUS * 2 + 1 },
    (_, index) =>
      targetPageStart + 1 + (index - SEARCH_PAGE_RADIUS) * PAGE_SIZE
  )
    .filter((start) => start > 0)
    .filter((start, index, starts) => starts.indexOf(start) === index);
  const pages = await Promise.all(
    pageFirstSubRanks.map((start) =>
      getPage(eventId, rankingType, start, selection)
    )
  );
  const entries = pages.flatMap((page) => page.entries);
  if (!entries.some((entry) => entry.personId === match.personId))
    throw new Error("Could not locate the selected ranking result.");

  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  return {
    ...lastPage,
    entries,
    startPosition: firstPage.startPosition,
    previousPageStart: firstPage.previousPageStart,
    nextPageStart: lastPage.nextPageStart,
  };
}

async function getDistantSearchWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  currentPageStart: number,
  match: RankingEntry,
  direction: -1 | 1
) {
  const targetPageStart = pageStartForSubRank(match.subRank);
  const pageStarts = [
    currentPageStart,
    ...getSearchBridgePageStarts(
      currentPageStart,
      targetPageStart,
      direction,
      PAGE_SIZE
    ),
    targetPageStart - PAGE_SIZE,
    targetPageStart,
    targetPageStart + PAGE_SIZE,
  ]
    .filter((start) => start >= 0)
    .filter((start, index, starts) => starts.indexOf(start) === index)
    .sort((left, right) => left - right);
  const pages = (
    await Promise.all(
      pageStarts.map((start) =>
        getPage(eventId, rankingType, start + 1, selection)
      )
    )
  ).filter((page) => page.entries.length > 0);
  const entries = pages.flatMap((page) => page.entries);
  if (!entries.some((entry) => entry.personId === match.personId))
    throw new Error("Could not locate the selected ranking result.");

  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  return {
    ...lastPage,
    entries,
    startPosition: firstPage.startPosition,
    previousPageStart: firstPage.previousPageStart,
    nextPageStart: lastPage.nextPageStart,
  };
}

function prefetchSearchResultPages(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  matches: Array<RankingEntry | null | undefined>,
  currentMatchIndex: number
) {
  if (matches.length < 2 || currentMatchIndex < 0) return;
  const requested = new Set<number>();

  for (const direction of [-1, 1] as const) {
    for (let distance = 1; distance <= SEARCH_PREFETCH_RADIUS; distance += 1) {
      const matchIndex =
        (currentMatchIndex + direction * distance + matches.length) %
        matches.length;
      const match = matches[matchIndex];
      if (!match) continue;
      const requestKey = pageStartForSubRank(match.subRank);
      if (requested.has(requestKey)) continue;
      requested.add(requestKey);
      void getSearchWindow(eventId, rankingType, selection, match).catch(
        () => undefined
      );
    }
  }
}

function searchRankings(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  search: string,
  regexSearch: boolean,
  signal: AbortSignal
) {
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    search,
    searchLimit: "500",
  });
  if (regexSearch) params.set("mode", "vim");
  if (selection.scope !== "world") params.set("region", selection.regionId);

  return fetch(`/api/rankings?${params}`, { signal }).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Search is unavailable.");
    }
    return response.json() as Promise<{ entries: RankingEntry[] }>;
  });
}

export function RankingsExplorer({
  initialData,
  initialSearch = "",
  initialRegexSearch = initialData?.regexSearch ?? false,
  initialEventId = "333",
  initialRankingType = "single",
  initialRegionSelection = { scope: "world", regionId: "" },
  initialRegions = {
    continents: FALLBACK_CONTINENTS,
    countries: FALLBACK_COUNTRIES,
  },
}: {
  initialData?: InitialRankingData;
  initialSearch?: string;
  initialRegexSearch?: boolean;
  initialEventId?: (typeof WCA_EVENTS)[number]["id"];
  initialRankingType?: "single" | "average";
  initialRegionSelection?: RegionSelection;
  initialRegions?: {
    continents: Array<{ id: string; name: string }>;
    countries: Array<{ id: string; name: string; iso2?: string }>;
  };
}) {
  const normalizedInitialSearch = initialSearch.trim();
  const [eventId, setEventId] = useState(initialEventId);
  const [rankingType, setRankingType] = useState<"single" | "average">(
    initialRankingType
  );
  const [regionSelection, setRegionSelection] = useState<RegionSelection>(
    initialRegionSelection
  );
  const regions: RegionOption[] = [
    { key: "world", scope: "world", regionId: "", label: "World" },
    ...initialRegions.continents.map((region) => ({
      key: `continent:${region.id}`,
      scope: "continent" as const,
      regionId: region.id,
      label: region.name.replace(/^_/, ""),
    })),
    ...initialRegions.countries.map((region) => ({
      key: `country:${region.id}`,
      scope: "country" as const,
      regionId: region.id,
      label: region.name,
      iso2: region.iso2,
    })),
  ];
  const [entries, setEntries] = useState<RankingEntry[]>(
    initialData?.entries ?? []
  );
  const [entriesRankingType, setEntriesRankingType] = useState(
    initialRankingType
  );
  const [startRank, setStartRank] = useState(initialData?.startRank ?? 1);
  const [startPosition, setStartPosition] = useState(
    initialData?.startPosition ?? 0
  );
  const [nextPageStart, setNextPageStart] = useState<number | null>(
    initialData?.nextPageStart ?? null
  );
  const [previousPageStart, setPreviousPageStart] = useState<number | null>(
    initialData?.previousPageStart ?? null
  );
  const [lastRank, setLastRank] = useState<number | null>(
    initialData?.lastRank ?? null
  );
  const [total, setTotal] = useState(
    initialData?.total ?? Number.POSITIVE_INFINITY
  );
  const [fetchedAt, setFetchedAt] = useState<string | null>(
    initialData?.fetchedAt ?? null
  );
  const [offlineStale, setOfflineStale] = useState(false);
  const [hasMore, setHasMore] = useState(initialData?.hasMore ?? true);
  const [loading, setLoading] = useState(!initialData);
  const [showLoading, setShowLoading] = useState(false);
  const [preserveListDuringLoad, setPreserveListDuringLoad] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [error, setError] = useState("");
  const [listOffset, setListOffset] = useState(0);
  const [pageReloadNonce, setPageReloadNonce] = useState(0);
  const [findOpen, setFindOpen] = useState(Boolean(normalizedInitialSearch && !initialRegexSearch));
  const [findQuery, setFindQuery] = useState(initialSearch);
  const [regexSearch, setRegexSearch] = useState(initialRegexSearch);
  const [findMatches, setFindMatches] = useState<RankingEntry[]>(
    orderSearchMatches(initialData?.searchMatches ?? [])
  );
  const [findIndex, setFindIndex] = useState(
    initialData?.searchMatches.length ? 0 : -1
  );
  const [findLoading, setFindLoading] = useState(false);
  const [findResolvedQuery, setFindResolvedQuery] = useState(
    normalizedInitialSearch
  );
  const [findError, setFindError] = useState("");
  const [highlightedPersonId, setHighlightedPersonId] = useState(
    initialData?.initialMatchPersonId ?? ""
  );
  const [hydrated, setHydrated] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [vimCommand, setVimCommand] = useState(":");
  const [vimHelpOpen, setVimHelpOpen] = useState(false);
  const [vimSearchActive, setVimSearchActive] = useState(initialRegexSearch);
  const [vimSearchQuery, setVimSearchQuery] = useState(
    initialRegexSearch ? initialSearch : ""
  );
  const [jumpUpArmed, setJumpUpArmed] = useState(false);
  const [jumpDownArmed, setJumpDownArmed] = useState(false);
  const [tableReachedTop, setTableReachedTop] = useState(false);
  const [atPageEnd, setAtPageEnd] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const headerFindInputRef = useRef<HTMLInputElement>(null);
  const railFindInputRef = useRef<HTMLInputElement>(null);
  const setHeaderFindInputRef = useCallback((input: HTMLInputElement | null) => {
    headerFindInputRef.current = input;
  }, []);
  const setRailFindInputRef = useCallback((input: HTMLInputElement | null) => {
    railFindInputRef.current = input;
  }, []);
  const tableReachedTopRef = useRef(false);
  const pendingSearchFocusHandoffRef =
    useRef<PendingSearchFocusHandoff | null>(null);
  const searchCompositionActiveRef = useRef(false);
  const searchFocusHandoffFrameRef = useRef<number | null>(null);
  const searchFocusHandoffTimerRef = useRef<number | null>(null);
  const vimInputRef = useRef<HTMLInputElement>(null);
  const vimCommandRef = useRef(vimCommand);
  const moreRequestRef = useRef(false);
  const previousRequestRef = useRef(false);
  const navigationEpochRef = useRef(0);
  const pendingRankRef = useRef(1);
  const pendingFocusLastRef = useRef(false);
  const pendingScrollToTopRef = useRef(false);
  const pendingScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const pendingNavigationAppendRef = useRef(false);
  const navigationTargetRankRef = useRef<number | null>(null);
  const jumpUpTimerRef = useRef<number | null>(null);
  const jumpDownTimerRef = useRef<number | null>(null);
  const jumpUpArmedRef = useRef(false);
  const jumpDownArmedRef = useRef(false);
  const preserveListDuringLoadRef = useRef(false);
  const scrollRestoreAttemptedRef = useRef(false);
  const scrollPersistenceReadyRef = useRef(false);
  const initialPageKeyRef = useRef(
    initialData
      ? [
          initialEventId,
          initialRankingType,
          initialRegionSelection.scope,
          initialRegionSelection.regionId,
          initialData.startRank,
        ].join(":")
      : ""
  );
  const forcePageLoadRef = useRef(false);
  const skipNextFindResetRef = useRef(false);
  const skipPageLoadStartRef = useRef<number | null>(null);
  const initialScrollRef = useRef(
    Boolean(
      initialData && normalizedInitialSearch && initialData.initialMatchPersonId
    )
  );
  const initialSearchRef = useRef(
    Boolean(initialData && normalizedInitialSearch)
  );
  const findMatchesRef = useRef<RankingEntry[]>(
    orderSearchMatches(initialData?.searchMatches ?? [])
  );
  const findIndexRef = useRef(initialData?.searchMatches.length ? 0 : -1);
  const rankingListRef = useRef<HTMLOListElement>(null);
  const eventPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const railEventPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingRowFocusRef = useRef<{
    anchorPersonId: string;
    direction: -1 | 1;
  } | null>(null);
  const rowFocusFrameRef = useRef<number | null>(null);
  const searchAnimationTimerRef = useRef<number | null>(null);
  const searchTransformOffsetRef = useRef(0);
  const pendingSearchLayoutAnchorRef = useRef<SearchLayoutAnchor | null>(null);
  const entriesRef = useRef(entries);
  const startRankRef = useRef(startRank);
  const startPositionRef = useRef(startPosition);
  const scrollAnimationStateRef = useRef<ScrollAnimationState>({
    frame: null,
    active: false,
    programmatic: false,
    clearProgrammaticTimer: null,
    settleTimer: null,
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + 1,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  const virtualRows = rowVirtualizer.getVirtualItems();

  const focusPendingSearchSurface = useCallback(() => {
    const pending = pendingSearchFocusHandoffRef.current;
    if (!pending || searchCompositionActiveRef.current) return false;

    const targetShouldBeRail = tableReachedTopRef.current;
    if ((pending.target === "rail") !== targetShouldBeRail) {
      pendingSearchFocusHandoffRef.current = null;
      return true;
    }

    const target =
      pending.target === "rail"
        ? railFindInputRef.current
        : headerFindInputRef.current;
    if (!target) return false;

    target.focus({ preventScroll: true });
    if (document.activeElement !== target) return false;

    if (pending.selectionStart !== null && pending.selectionEnd !== null) {
      try {
        target.setSelectionRange(
          pending.selectionStart,
          pending.selectionEnd,
          pending.selectionDirection ?? undefined
        );
      } catch {
        // Some mobile browsers can reject selection changes during focus transfer.
      }
    }

    pendingSearchFocusHandoffRef.current = null;
    return true;
  }, []);

  const schedulePendingSearchFocus = useCallback(() => {
    if (!pendingSearchFocusHandoffRef.current) return;

    if (searchFocusHandoffFrameRef.current !== null) {
      window.cancelAnimationFrame(searchFocusHandoffFrameRef.current);
      searchFocusHandoffFrameRef.current = null;
    }
    if (searchFocusHandoffTimerRef.current !== null) {
      window.clearTimeout(searchFocusHandoffTimerRef.current);
      searchFocusHandoffTimerRef.current = null;
    }

    if (focusPendingSearchSurface()) return;
    if (searchCompositionActiveRef.current) return;

    searchFocusHandoffFrameRef.current = window.requestAnimationFrame(() => {
      searchFocusHandoffFrameRef.current = null;
      if (focusPendingSearchSurface()) return;

      searchFocusHandoffTimerRef.current = window.setTimeout(() => {
        searchFocusHandoffTimerRef.current = null;
        focusPendingSearchSurface();
      }, 25);
    });
  }, [focusPendingSearchSurface]);

  useLayoutEffect(() => {
    schedulePendingSearchFocus();
  }, [schedulePendingSearchFocus, tableReachedTop]);

  useEffect(() => {
    const isFindInput = (target: EventTarget | null) =>
      target === headerFindInputRef.current || target === railFindInputRef.current;
    const handleCompositionStart = (event: CompositionEvent) => {
      if (isFindInput(event.target)) searchCompositionActiveRef.current = true;
    };
    const handleCompositionEnd = (event: CompositionEvent) => {
      if (!isFindInput(event.target)) return;
      searchCompositionActiveRef.current = false;
      schedulePendingSearchFocus();
    };

    document.addEventListener("compositionstart", handleCompositionStart);
    document.addEventListener("compositionend", handleCompositionEnd);
    return () => {
      document.removeEventListener("compositionstart", handleCompositionStart);
      document.removeEventListener("compositionend", handleCompositionEnd);
      if (searchFocusHandoffFrameRef.current !== null)
        window.cancelAnimationFrame(searchFocusHandoffFrameRef.current);
      if (searchFocusHandoffTimerRef.current !== null)
        window.clearTimeout(searchFocusHandoffTimerRef.current);
    };
  }, [schedulePendingSearchFocus]);

  useLayoutEffect(() => {
    const anchor = pendingSearchLayoutAnchorRef.current;
    if (!anchor) return;
    pendingSearchLayoutAnchorRef.current = null;
    if (anchor.requestEpoch !== navigationEpochRef.current) return;
    const anchoredIndex = entries.findIndex(
      (entry) => entry.personId === anchor.personId
    );
    if (anchoredIndex < 0) return;
    const list = rankingListRef.current;
    const measuredTop = rowVirtualizer.getOffsetForIndex(
      anchoredIndex,
      "start"
    )?.[0];
    const absoluteTop =
      measuredTop ??
      (list?.getBoundingClientRect().top ?? 0) +
        window.scrollY +
        anchoredIndex * ROW_HEIGHT;
    scrollAnimationStateRef.current.programmatic = true;
    window.scrollTo({
      top: Math.max(0, absoluteTop - anchor.viewportTop),
      behavior: "auto",
    });
  }, [entries, rowVirtualizer]);

  useEffect(() => {
    rowVirtualizerRef.current = rowVirtualizer;
  }, [rowVirtualizer]);

  useEffect(() => {
    // This state keeps the server-rendered list in the DOM for the hydration pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!loading) {
      const frame = window.requestAnimationFrame(() => setShowLoading(false));
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(() => setShowLoading(true), 200);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const scrollStorageKey = [
    "wca-rankings-scroll-v1",
    eventId,
    rankingType,
    regionSelection.scope,
    regionSelection.regionId || "world",
    findQuery.trim(),
  ].join(":");

  useEffect(() => {
    if (!hydrated || scrollRestoreAttemptedRef.current) return;
    scrollRestoreAttemptedRef.current = true;
    let savedScrollY = 0;
    try {
      const saved = window.localStorage.getItem(scrollStorageKey);
      const parsed = saved ? (JSON.parse(saved) as { scrollY?: number }) : null;
      if (parsed && Number.isFinite(parsed.scrollY))
        savedScrollY = Math.max(0, parsed.scrollY ?? 0);
    } catch {
      savedScrollY = 0;
    }

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!normalizedInitialSearch && !initialScrollRef.current && savedScrollY > 0)
          window.scrollTo({ top: savedScrollY, behavior: "auto" });
        scrollPersistenceReadyRef.current = true;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [hydrated, normalizedInitialSearch, scrollStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    let saveTimer: number | null = null;
    const saveScrollPosition = () => {
      if (!scrollPersistenceReadyRef.current) return;
      try {
        window.localStorage.setItem(
          scrollStorageKey,
          JSON.stringify({ scrollY: Math.max(0, Math.round(window.scrollY)) })
        );
      } catch {
        // Storage can be unavailable in private browsing or restricted embeds.
      }
    };
    const onScroll = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveScrollPosition();
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", saveScrollPosition);
    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", saveScrollPosition);
    };
  }, [hydrated, scrollStorageKey]);

  useEffect(() => {
    const measure = () => setListOffset(listRef.current?.offsetTop ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [eventId, rankingType, loading, regionSelection]);

  useEffect(() => {
    if (
      !hydrated ||
      !initialScrollRef.current ||
      !initialData?.initialMatchPersonId
    )
      return;
    const targetIndex = entries.findIndex(
      (entry) => entry.personId === initialData.initialMatchPersonId
    );
    if (targetIndex < 0) return;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (!initialScrollRef.current) return;
        initialScrollRef.current = false;
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "center",
          requestedDuration: getScrollAnimationDuration(targetIndex),
          schedule: false,
          targetOffset: () =>
            rowVirtualizerRef.current.getOffsetForIndex(
              targetIndex,
              "start"
            )?.[0],
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [entries, hydrated, initialData]);

  useEffect(() => {
    entriesRef.current = entries;
    startRankRef.current = startRank;
    startPositionRef.current = startPosition;
  }, [entries, startPosition, startRank]);

  useEffect(() => {
    const updateRailVisibility = () => {
      const tableTop = rankingListRef.current?.getBoundingClientRect().top;
      const nextTableReachedTop =
        (tableTop ?? Number.POSITIVE_INFINITY) <= 0;
      if (nextTableReachedTop !== tableReachedTopRef.current) {
        const source = nextTableReachedTop
          ? headerFindInputRef.current
          : railFindInputRef.current;
        if (source && document.activeElement === source) {
          pendingSearchFocusHandoffRef.current = {
            target: nextTableReachedTop ? "rail" : "header",
            selectionStart: source.selectionStart,
            selectionEnd: source.selectionEnd,
            selectionDirection: source.selectionDirection,
          };
        }
        tableReachedTopRef.current = nextTableReachedTop;
        setTableReachedTop(nextTableReachedTop);
      }
      setAtPageEnd(
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 1
      );
    };
    const frame = window.requestAnimationFrame(updateRailVisibility);
    window.addEventListener("scroll", updateRailVisibility, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateRailVisibility);
    };
  }, [entries.length, loading]);

  useEffect(() => {
    const syncStateFromUrl = () => {
      const url = new URL(window.location.href);
      const nextEventId =
        url.searchParams.get("eventId") ?? url.searchParams.get("event");
      const nextRankingType =
        url.searchParams.get("result") ?? url.searchParams.get("type");
      const nextRegion = url.searchParams.get("region");
      const search = url.searchParams.get("search") ?? "";
      const resolvedEventId = isEventId(nextEventId) ? nextEventId : "333";
      const resolvedRankingType =
        resolvedEventId === "333mbf"
          ? "single"
          : isRankingType(nextRankingType)
          ? nextRankingType
          : "single";
      const { scope, regionId } = parseRegionQuery(nextRegion);
      setEventId(resolvedEventId);
      setRankingType(resolvedRankingType);
      setRegionSelection({ scope, regionId });
      setFindQuery(search);
      const nextRegexSearch = url.searchParams.get("mode") === "vim" && Boolean(search.trim());
      setRegexSearch(nextRegexSearch);
      setVimSearchActive(nextRegexSearch);
      setVimSearchQuery(nextRegexSearch ? search : "");
      setFindOpen(Boolean(search.trim() && !nextRegexSearch));
      updateQueryParams({
        eventId: resolvedEventId === "333" ? null : resolvedEventId,
        result: resolvedRankingType === "single" ? null : resolvedRankingType,
        event: null,
        type: null,
        region: regionId || null,
        scope: null,
      });
    };

    syncStateFromUrl();
    window.addEventListener("popstate", syncStateFromUrl);
    return () => window.removeEventListener("popstate", syncStateFromUrl);
  }, []);

  useEffect(() => {
    const pageKey = [
      eventId,
      rankingType,
      regionSelection.scope,
      regionSelection.regionId,
      startRank,
    ].join(":");
    if (initialPageKeyRef.current === pageKey && !forcePageLoadRef.current) {
      return;
    }
    forcePageLoadRef.current = false;
    initialPageKeyRef.current = "";
    if (skipPageLoadStartRef.current === startRank) {
      skipPageLoadStartRef.current = null;
      return;
    }
    skipPageLoadStartRef.current = null;
    let active = true;
    const requestNavigationEpoch = navigationEpochRef.current;
    const preserveList = preserveListDuringLoadRef.current;
    // This reset is coupled to the request started immediately below.
    setLoading(true);
    if (!preserveList) {
      setEntries([]);
      setNextPageStart(null);
      setPreviousPageStart(null);
      setHasMore(true);
      setTotal(Number.POSITIVE_INFINITY);
    }
    setError("");
    moreRequestRef.current = false;
    previousRequestRef.current = false;
    const focusLast = pendingFocusLastRef.current;
    pendingFocusLastRef.current = false;
    const pageRequest = focusLast
      ? getEndWindow(eventId, rankingType, regionSelection, startRank)
      : getPage(eventId, rankingType, startRank, regionSelection);
    pageRequest
      .then((data) => {
        if (
          !active ||
          requestNavigationEpoch !== navigationEpochRef.current
        )
          return;
        const currentPosition = getCurrentViewportPosition(
          listRef.current,
          entriesRef.current,
          startPositionRef.current,
          startPositionRef.current,
          rowVirtualizerRef.current.getVirtualItems()[0]?.index
        );
        const currentSubRank = getCurrentViewportSubRank(
          listRef.current,
          entriesRef.current,
          startRankRef.current
        );
        const scrollToTop = pendingScrollToTopRef.current;
        const pendingDirection = pendingScrollDirectionRef.current;
        const rankForStep = pendingRankRef.current;
        const appendNavigationRequested =
          pendingNavigationAppendRef.current &&
          !scrollToTop &&
          !focusLast &&
          Boolean(pendingDirection);
        const previousEntries = entriesRef.current;
        const appendNavigation =
          appendNavigationRequested &&
          pendingDirection !== null &&
          areRankingWindowsContiguous(
            previousEntries,
            data.entries,
            pendingDirection
          );
        const previousStartPosition = startPositionRef.current;
        const previousListHeight = appendNavigation && pendingDirection === -1
          ? rowVirtualizerRef.current.getTotalSize()
          : null;
        const loadedEntries = appendNavigation
          ? pendingDirection === 1
            ? [
                ...previousEntries,
                ...data.entries.filter(
                  (entry) =>
                    !previousEntries.some(
                      (currentEntry) => currentEntry.personId === entry.personId
                    )
                ),
              ]
            : [
                ...data.entries.filter(
                  (entry) =>
                    !previousEntries.some(
                      (currentEntry) => currentEntry.personId === entry.personId
                    )
                ),
                ...previousEntries,
              ]
          : data.entries;
        const loadedStartPosition =
          appendNavigation && pendingDirection === -1
            ? data.startPosition
            : previousStartPosition;
        pendingScrollToTopRef.current = false;
        pendingNavigationAppendRef.current = false;
        setEntries(loadedEntries);
        setEntriesRankingType(rankingType);
        setStartPosition(
          appendNavigation ? loadedStartPosition : data.startPosition
        );
        if (!appendNavigation || pendingDirection === 1) {
          setNextPageStart(data.nextPageStart);
        }
        if (!appendNavigation || pendingDirection === -1) {
          setPreviousPageStart(data.previousPageStart);
        }
        setLastRank(data.lastRank);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setFetchedAt(data.fetchedAt);
        setOfflineStale(Boolean(data.offlineStale));
        const requestedTargetIndex = focusLast
          ? Math.max(0, loadedEntries.length - 1)
          : loadedEntries.findIndex(
              (entry) => entry.subRank >= rankForStep
            );
        const targetIndex =
          requestedTargetIndex >= 0
            ? requestedTargetIndex
            : pendingDirection === -1
            ? Math.max(0, loadedEntries.length - 1)
            : 0;
        const shouldScrollToTarget = Boolean(
          scrollToTop ||
            focusLast ||
            pendingDirection ||
            appendNavigation
        );
        pendingScrollDirectionRef.current = null;
        if (scrollToTop) {
          animateScrollTo(
            scrollAnimationStateRef.current,
            0,
            "smooth",
            getScrollAnimationDuration(currentPosition)
          );
        } else if (shouldScrollToTarget) {
          if (previousListHeight !== null) {
            window.requestAnimationFrame(() => {
              const addedHeight = Math.max(
                0,
                rowVirtualizerRef.current.getTotalSize() - previousListHeight
              );
              if (addedHeight > 0)
                window.scrollBy({ top: addedHeight, behavior: "auto" });
            });
          }
          window.requestAnimationFrame(() => {
            scrollToEntry({
              state: scrollAnimationStateRef.current,
              list: listRef.current,
              index: targetIndex,
              alignment: focusLast ? "bottom" : "top",
              bottomOffset: focusLast ? END_MARKER_PEEK : 0,
              requestedBehavior: "smooth",
              requestedDuration: getScrollAnimationDuration(
                Math.abs(rankForStep - currentSubRank)
              ),
              targetOffset: focusLast
                ? undefined
                : () =>
                    rowVirtualizerRef.current.getOffsetForIndex(
                      targetIndex,
                      "start"
                    )?.[0],
            });
          });

        }
      })
      .catch((requestError: unknown) => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
        }
      })
      .finally(() => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          setLoading(false);
          preserveListDuringLoadRef.current = false;
          setPreserveListDuringLoad(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    eventId,
    rankingType,
    regionSelection,
    pageReloadNonce,
    startRank,
  ]);

  const jumpToMatch = useCallback(
    (
      match: RankingEntry | undefined,
      direction: -1 | 1 = 1,
      currentMatch: RankingEntry | null = null
    ) => {
      if (!match) return;
      const requestEpoch = navigationEpochRef.current + 1;
      navigationEpochRef.current = requestEpoch;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingSearchLayoutAnchorRef.current = null;
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const activeList = rankingListRef.current;
      const activeTransform = searchTransformOffsetRef.current;
      if (activeList && activeTransform !== 0) {
        activeList.style.transform = "";
        window.scrollBy({ top: -activeTransform, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      const currentMatchViewportTop = (() => {
        if (!currentMatch) return null;
        const mountedRow = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".listItem[data-person-id]"
          )
        ).find(
          (row) => row.dataset.personId === currentMatch.personId
        );
        if (mountedRow) return mountedRow.getBoundingClientRect().top;
        const currentEntryIndex = entriesRef.current.findIndex(
          (entry) => entry.personId === currentMatch.personId
        );
        if (currentEntryIndex < 0) return null;
        const measuredTop =
          rowVirtualizerRef.current.getOffsetForIndex(
            currentEntryIndex,
            "start"
          )?.[0];
        return measuredTop === undefined
          ? null
          : measuredTop - window.scrollY;
      })();
      pendingNavigationAppendRef.current = false;
      pendingRankRef.current = match.subRank;
      navigationTargetRankRef.current = match.subRank;
      prefetchSearchResultPages(
        eventId,
        rankingType,
        regionSelection,
        findMatchesRef.current,
        findIndexRef.current
      );
      setError("");
      setLoading(true);
      preserveListDuringLoadRef.current = true;
      setPreserveListDuringLoad(true);
      const finishSearchNavigation = () => {
        if (navigationEpochRef.current !== requestEpoch) return;
        setLoading(false);
        preserveListDuringLoadRef.current = false;
        setPreserveListDuringLoad(false);
      };

      const targetPageStart = pageStartForSubRank(match.subRank);
      const currentSearchSubRank =
        currentMatch?.subRank ??
        getCurrentViewportSubRank(
          listRef.current,
          entriesRef.current,
          startRankRef.current
        );
      const scrollDirection = getSearchScrollDirection(
        currentMatch,
        match,
        direction
      );
      pendingScrollDirectionRef.current = scrollDirection;
      const searchPeopleDistance = Math.abs(
        match.subRank - currentSearchSubRank
      );
      const currentPageStart = currentMatch
        ? pageStartForSubRank(currentMatch.subRank)
        : null;
      const jumpMode =
        currentPageStart === null
          ? "local"
          : getSearchJumpMode(
              currentPageStart,
              targetPageStart,
              scrollDirection,
              PAGE_SIZE
            );
      const pageRequest =
        jumpMode === "multi-page" && currentPageStart !== null
          ? getDistantSearchWindow(
              eventId,
              rankingType,
              regionSelection,
              currentPageStart,
              match,
              scrollDirection
            )
          : getSearchWindow(eventId, rankingType, regionSelection, match);

      void pageRequest
        .then((data) => {
          if (navigationEpochRef.current !== requestEpoch) return;
          const targetIndex = data.entries.findIndex(
            (entry) => entry.personId === match.personId
          );
          if (targetIndex < 0)
            throw new Error("Could not locate the selected ranking result.");

          const currentIndex = currentMatch
            ? data.entries.findIndex(
                (entry) => entry.personId === currentMatch.personId
              )
            : -1;
          if (
            currentMatch &&
            currentMatchViewportTop !== null &&
            currentIndex >= 0
          ) {
            pendingSearchLayoutAnchorRef.current = {
              requestEpoch,
              personId: currentMatch.personId,
              viewportTop: currentMatchViewportTop,
            };
          }

          const nextSearchStart = data.entries[0]?.subRank ?? 1;
          setHighlightedPersonId(match.personId);
          setEntries(data.entries);
          if (nextSearchStart !== startRankRef.current) {
            skipPageLoadStartRef.current = nextSearchStart;
            setStartRank(nextSearchStart);
          }
          setStartPosition(data.startPosition);
          setNextPageStart(data.nextPageStart);
          setPreviousPageStart(data.previousPageStart);
          setLastRank(data.lastRank);
          setHasMore(data.hasMore);
          setTotal(data.total);
          setFetchedAt(data.fetchedAt);
          setOfflineStale(Boolean(data.offlineStale));
          pendingScrollDirectionRef.current = null;

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (navigationEpochRef.current !== requestEpoch) return;
              const list = rankingListRef.current;
              if (!list) {
                finishSearchNavigation();
                return;
              }
              const listTop = list.getBoundingClientRect().top + window.scrollY;
              const measuredTargetTop =
                rowVirtualizerRef.current.getOffsetForIndex(
                  targetIndex,
                  "start"
                )?.[0];
              const naturalTargetTop =
                Math.max(
                  0,
                  measuredTargetTop ??
                    listTop + targetIndex * ROW_HEIGHT
                );
              const centeredTargetTop = centeredRowScrollTop(
                naturalTargetTop,
                window.innerHeight
              );
              const centerRenderedMatch = () => {
                const targetRow = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    ".listItem[data-person-id]"
                  )
                ).find((row) => row.dataset.personId === match.personId);
                if (!targetRow) return false;
                const targetRect = targetRow.getBoundingClientRect();
                window.scrollTo({
                  top: centeredRowScrollTop(
                    targetRect.top + window.scrollY,
                    window.innerHeight,
                    targetRect.height
                  ),
                  behavior: "auto",
                });
                return true;
              };
              if (currentIndex >= 0) {
                const duration = getSearchAnimationDuration(
                  jumpMode,
                  searchPeopleDistance
                );
                animateScrollTo(
                  scrollAnimationStateRef.current,
                  centeredTargetTop,
                  "smooth",
                  duration
                );
                searchAnimationTimerRef.current = window.setTimeout(() => {
                  if (navigationEpochRef.current !== requestEpoch) return;
                  if (!centerRenderedMatch()) {
                    const settledTargetTop =
                      rowVirtualizerRef.current.getOffsetForIndex(
                        targetIndex,
                        "start"
                      )?.[0];
                    if (settledTargetTop !== undefined)
                      window.scrollTo({
                        top: centeredRowScrollTop(
                          settledTargetTop,
                          window.innerHeight
                        ),
                        behavior: "auto",
                      });
                  }
                  searchAnimationTimerRef.current = null;
                  finishSearchNavigation();
                }, duration + SCROLL_SETTLE_DELAY_MS);
                return;
              }

              const transformOffset =
                scrollDirection * SEARCH_ANIMATION_ROWS * ROW_HEIGHT;
              const animatedTargetTop = Math.max(
                0,
                centeredTargetTop + transformOffset
              );
              const duration = getSearchAnimationDuration(
                "local",
                searchPeopleDistance
              );
              window.scrollTo({ top: centeredTargetTop, behavior: "auto" });
              list.style.transform = `translateY(${transformOffset}px)`;
              searchTransformOffsetRef.current = transformOffset;
              window.requestAnimationFrame(() => {
                if (navigationEpochRef.current !== requestEpoch) return;
                animateScrollTo(
                  scrollAnimationStateRef.current,
                  animatedTargetTop,
                  "smooth",
                  duration
                );
                searchAnimationTimerRef.current = window.setTimeout(() => {
                  if (navigationEpochRef.current !== requestEpoch) return;
                  list.style.transform = "";
                  searchTransformOffsetRef.current = 0;
                  window.scrollBy({ top: -transformOffset, behavior: "auto" });
                  centerRenderedMatch();
                  searchAnimationTimerRef.current = null;
                  finishSearchNavigation();
                }, duration + SCROLL_SETTLE_DELAY_MS);
              });
            });
          });
        })
        .catch((requestError: unknown) => {
          if (navigationEpochRef.current !== requestEpoch) return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
          finishSearchNavigation();
        });
    },
    [eventId, rankingType, regionSelection]
  );

  const cycleFind = useCallback(
    (direction: 1 | -1 = 1) => {
      const matches = findMatchesRef.current;
      if (matches.length === 0) return;
      const currentIndex = findIndexRef.current;
      const currentMatch =
        currentIndex >= 0 ? matches[currentIndex] : null;
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : matches.length - 1
          : (currentIndex + direction + matches.length) % matches.length;
      const nextMatch = matches[nextIndex];
      if (!nextMatch) {
        findIndexRef.current = -1;
        setFindIndex(-1);
        return;
      }
      findIndexRef.current = nextIndex;
      setFindIndex(nextIndex);
      jumpToMatch(nextMatch, direction, currentMatch);
    },
    [jumpToMatch]
  );

  const resetFind = useCallback(() => {
    findMatchesRef.current = [];
    findIndexRef.current = -1;
    setSearchQueryParam("");
    updateQueryParams({ mode: null });
    setFindQuery("");
    setRegexSearch(false);
    setVimSearchActive(false);
    setVimSearchQuery("");
    setFindMatches([]);
    setFindIndex(-1);
    setFindLoading(false);
    setFindResolvedQuery("");
    setFindError("");
    setHighlightedPersonId("");
    pendingScrollDirectionRef.current = null;
  }, []);

  const closeFind = useCallback(() => {
    resetFind();
    setFindOpen(false);
  }, [resetFind]);

  const cancelVimSearch = useCallback(() => {
    resetFind();
    setFindOpen(false);
    setVimMode(false);
    setVimHelpOpen(false);
    setVimCommand(":");
  }, [resetFind]);

  useEffect(() => {
    const normalizedQuery = findQuery.trim();
    const isInitialSearch =
      initialSearchRef.current && normalizedQuery === normalizedInitialSearch;
    const skipNavigationReset = skipNextFindResetRef.current;
    skipNextFindResetRef.current = false;
    if (!isInitialSearch && !skipNavigationReset) {
      navigationEpochRef.current += 1;
      pendingSearchLayoutAnchorRef.current = null;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const activeList = rankingListRef.current;
      const activeTransform = searchTransformOffsetRef.current;
      if (activeList && activeTransform !== 0) {
        activeList.style.transform = "";
        window.scrollBy({ top: -activeTransform, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      setHighlightedPersonId("");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => {
        if (controller.signal.aborted) return;
        if (
          initialSearchRef.current &&
          normalizedQuery === normalizedInitialSearch
        ) {
          initialSearchRef.current = false;
          setFindLoading(false);
          return;
        }
        findMatchesRef.current = [];
        findIndexRef.current = -1;
        setFindMatches([]);
        setFindIndex(-1);
        setFindError("");
        setHighlightedPersonId("");

        if (!normalizedQuery) {
          setFindResolvedQuery("");
          setFindLoading(false);
          return;
        }

        setFindLoading(true);
        searchRankings(
          eventId,
          rankingType,
          regionSelection,
          normalizedQuery,
          regexSearch,
          controller.signal
        )
          .then((data) => {
            if (controller.signal.aborted) return;
            setFindResolvedQuery(normalizedQuery);
            const orderedMatches = orderSearchMatches(data.entries);
            findMatchesRef.current = orderedMatches;
            setFindMatches(orderedMatches);
            const firstMatch = orderedMatches[0];
            if (firstMatch) {
              findIndexRef.current = 0;
              setFindIndex(0);
              jumpToMatch(firstMatch);
            }
          })
          .catch((requestError: unknown) => {
            if (!controller.signal.aborted) {
              setFindResolvedQuery(normalizedQuery);
              setFindError(
                requestError instanceof Error
                  ? requestError.message
                  : "Search is unavailable."
              );
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setFindLoading(false);
          });
      },
      normalizedQuery ? 800 : 0
    );

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    eventId,
    findQuery,
    normalizedInitialSearch,
    rankingType,
    regionSelection,
    regexSearch,
    jumpToMatch,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");
      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        if (vimMode) {
          setVimMode(false);
          setVimCommand(":");
        }
        if (vimSearchActive || regexSearch) resetFind();
        setVimSearchActive(false);
        setVimSearchQuery("");
        setRegexSearch(false);
        updateQueryParams({ mode: null });
        setFindOpen(true);
        window.requestAnimationFrame(() => {
          const input = tableReachedTop
            ? railFindInputRef.current
            : headerFindInputRef.current;
          input?.focus();
          input?.select();
        });
        return;
      }
      if (vimMode) return;
      if (
        key === "e" &&
        !isEditable &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        const trigger =
          tableReachedTop || jumpUpArmed
            ? railEventPickerTriggerRef.current
            : eventPickerTriggerRef.current;
        if (!trigger) return;
        event.preventDefault();
        if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
        trigger.focus();
        return;
      }
      if (vimSearchActive && key === "n" && !isEditable) {
        event.preventDefault();
        setFindOpen(false);
        cycleFind();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "g") {
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        if (vimSearchActive) {
          setFindOpen(false);
          if (findQuery.trim()) cycleFind(direction);
        } else {
          setFindOpen(true);
          if (findQuery.trim()) cycleFind(direction);
          else resetFind();
        }
        return;
      }
      if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        closeFind();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cycleFind,
    closeFind,
    findOpen,
    findQuery,
    regexSearch,
    resetFind,
    tableReachedTop,
    jumpUpArmed,
    vimMode,
    vimSearchActive,
  ]);

  const loadMore = useCallback(async () => {
    if (
      !nextPageStart ||
      !hasMore ||
      moreRequestRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollAnimationStateRef.current.programmatic
    )
      return;
    const requestEpoch = navigationEpochRef.current;
    moreRequestRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getPage(
        eventId,
        rankingType,
        nextPageStart,
        regionSelection
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        preserveListDuringLoadRef.current ||
        scrollAnimationStateRef.current.programmatic
      )
        return;
      setEntries((current) => [
        ...current,
        ...data.entries.filter(
          (entry) => !current.some((item) => item.personId === entry.personId)
        ),
      ]);
      setNextPageStart(data.nextPageStart);
      setHasMore(data.hasMore);
      setLastRank(data.lastRank);
      setTotal(data.total);
      setFetchedAt(data.fetchedAt);
      setOfflineStale(Boolean(data.offlineStale));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load more rankings."
      );
    } finally {
      moreRequestRef.current = false;
      setLoadingMore(false);
    }
  }, [eventId, hasMore, loading, nextPageStart, rankingType, regionSelection]);

  const loadPrevious = useCallback(async () => {
    if (
      previousPageStart === null ||
      previousRequestRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollAnimationStateRef.current.programmatic
    )
      return;
    const requestEpoch = navigationEpochRef.current;
    previousRequestRef.current = true;
    setLoadingPrevious(true);
    const previousListHeight = rowVirtualizer.getTotalSize();
    try {
      const data = await getPage(
        eventId,
        rankingType,
        previousPageStart,
        regionSelection
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        preserveListDuringLoadRef.current ||
        scrollAnimationStateRef.current.programmatic
      )
        return;
      const newEntries = data.entries.filter(
        (entry) =>
          !entriesRef.current.some((item) => item.personId === entry.personId)
      );
      setEntries((current) => [...newEntries, ...current]);
      setStartPosition(data.startPosition);
      setPreviousPageStart(data.previousPageStart);
      setLastRank(data.lastRank);
      setFetchedAt(data.fetchedAt);
      setOfflineStale(Boolean(data.offlineStale));
      window.requestAnimationFrame(() => {
        const addedHeight = Math.max(
          0,
          rowVirtualizer.getTotalSize() - previousListHeight
        );
        if (addedHeight > 0)
          window.scrollBy({ top: addedHeight, behavior: "auto" });
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load earlier rankings."
      );
    } finally {
      previousRequestRef.current = false;
      setLoadingPrevious(false);
    }
  }, [
    eventId,
    loading,
    previousPageStart,
    rankingType,
    regionSelection,
    rowVirtualizer,
  ]);

  const focusRowAtIndex = useCallback(
    (index: number) => {
      rowVirtualizer.scrollToIndex(index, { align: "auto" });
      if (rowFocusFrameRef.current !== null)
        window.cancelAnimationFrame(rowFocusFrameRef.current);

      let attemptsRemaining = 4;
      const focusWhenRendered = () => {
        rowFocusFrameRef.current = window.requestAnimationFrame(() => {
          const row = rankingListRef.current?.querySelector<HTMLElement>(
            `[data-row-index="${index}"]`,
          );
          if (row) {
            row.focus({ preventScroll: true });
            rowFocusFrameRef.current = null;
            return;
          }
          attemptsRemaining -= 1;
          if (attemptsRemaining > 0) focusWhenRendered();
          else rowFocusFrameRef.current = null;
        });
      };
      focusWhenRendered();
    },
    [rowVirtualizer],
  );

  const handleRowNavigate = useCallback(
    (rowIndex: number, direction: -1 | 1) => {
      const targetIndex = rowIndex + direction;
      if (targetIndex >= 0 && targetIndex < entries.length) {
        focusRowAtIndex(targetIndex);
        return;
      }

      const anchor = entries[rowIndex];
      if (!anchor) return;
      if (direction === -1 && previousPageStart === null) return;
      if (direction === 1 && !hasMore) return;

      pendingRowFocusRef.current = {
        anchorPersonId: anchor.personId,
        direction,
      };
      if (direction === -1) void loadPrevious();
      else void loadMore();
    },
    [
      entries,
      focusRowAtIndex,
      hasMore,
      loadMore,
      loadPrevious,
      previousPageStart,
    ],
  );

  useEffect(() => {
    const pending = pendingRowFocusRef.current;
    if (!pending) return;
    const anchorIndex = entries.findIndex(
      (entry) => entry.personId === pending.anchorPersonId,
    );
    const targetIndex = anchorIndex + pending.direction;
    if (anchorIndex < 0 || targetIndex < 0 || targetIndex >= entries.length)
      return;
    pendingRowFocusRef.current = null;
    focusRowAtIndex(targetIndex);
  }, [entries, focusRowAtIndex]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    // Loading the next bucket is the synchronization performed by this effect.
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - 12) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadMore();
    }
  }, [entries.length, loadMore, virtualRows]);

  useEffect(() => {
    const onScroll = () => {
      if (
        !scrollAnimationStateRef.current.programmatic &&
        window.scrollY <= listOffset + ROW_HEIGHT * 14
      ) {
        navigationTargetRankRef.current = null;
        void loadPrevious();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listOffset, loadPrevious]);

  useEffect(() => {
    // A search result can be rendered at the document's top. In that state an
    // additional upward gesture does not emit a scroll event, so prime the
    // previous window after the virtual list has committed.
    const frame = window.requestAnimationFrame(() => {
      if (
        !scrollAnimationStateRef.current.programmatic &&
        window.scrollY <= listOffset + ROW_HEIGHT * 14
      )
        void loadPrevious();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entries.length, listOffset, loadPrevious]);

  useEffect(() => {
    const cancelOnUserInput = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".Jump-button")
      )
        return;
      if (
        !scrollAnimationStateRef.current.active &&
        !scrollAnimationStateRef.current.programmatic &&
        !preserveListDuringLoadRef.current
      )
        return;
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      pendingSearchLayoutAnchorRef.current = null;
      navigationTargetRankRef.current = null;
      pendingNavigationAppendRef.current = false;
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const list = rankingListRef.current;
      const transformOffset = searchTransformOffsetRef.current;
      if (list && transformOffset !== 0) {
        list.style.transform = "";
        window.scrollBy({ top: -transformOffset, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      setLoading(false);
      preserveListDuringLoadRef.current = false;
      setPreserveListDuringLoad(false);
    };
    window.addEventListener("wheel", cancelOnUserInput, { passive: true });
    window.addEventListener("touchstart", cancelOnUserInput, { passive: true });
    window.addEventListener("pointerdown", cancelOnUserInput, {
      passive: true,
    });
    return () => {
      window.removeEventListener("wheel", cancelOnUserInput);
      window.removeEventListener("touchstart", cancelOnUserInput);
      window.removeEventListener("pointerdown", cancelOnUserInput);
    };
  }, []);

  useEffect(
    () => () => {
      if (rowFocusFrameRef.current !== null)
        window.cancelAnimationFrame(rowFocusFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    const animationState = scrollAnimationStateRef.current;
    return () => {
      cancelScrollAnimation(animationState);
      if (searchAnimationTimerRef.current !== null)
        window.clearTimeout(searchAnimationTimerRef.current);
    };
  }, []);

  const visibleSubRank =
    entries[virtualRows[0]?.index ?? 0]?.subRank ?? startRank;
  const renderedRows = hydrated
    ? virtualRows
    : entries.map((_, index) => ({
        index,
        start: index * ROW_HEIGHT,
        key: index,
      }));
  const renderedListHeight = hydrated
    ? rowVirtualizer.getTotalSize()
    : entries.length * ROW_HEIGHT + (hasMore ? ROW_HEIGHT : 0);

  const resetToRank = useCallback(
    (rank: number) => {
      // Vim and jump controls pass the internal sub_rank, never the displayed rank.
      navigationEpochRef.current += 1;
      cancelScrollAnimation(scrollAnimationStateRef.current);
      if (searchAnimationTimerRef.current !== null) {
        window.clearTimeout(searchAnimationTimerRef.current);
        searchAnimationTimerRef.current = null;
      }
      const activeList = rankingListRef.current;
      const activeTransform = searchTransformOffsetRef.current;
      if (activeList && activeTransform !== 0) {
        activeList.style.transform = "";
        window.scrollBy({ top: -activeTransform, behavior: "auto" });
        searchTransformOffsetRef.current = 0;
      }
      pendingNavigationAppendRef.current = false;
      setLoading(false);
      const maximumRank = lastRank ?? (Number.isFinite(total) ? total : rank);
      const normalizedRank = Math.max(1, Math.min(rank, maximumRank));
      const currentRank = getCurrentViewportSubRank(
        listRef.current,
        entriesRef.current,
        startRankRef.current
      );
      navigationTargetRankRef.current = normalizedRank;
      pendingRankRef.current = normalizedRank;
      if (normalizedRank === 1) {
        if (findQuery.trim()) skipNextFindResetRef.current = true;
        resetFind();
        setFindOpen(false);
        pendingFocusLastRef.current = false;
        pendingScrollDirectionRef.current = null;
        pendingScrollToTopRef.current = true;
        cancelScrollAnimation(scrollAnimationStateRef.current);
        preserveListDuringLoadRef.current = true;
        setPreserveListDuringLoad(true);
        forcePageLoadRef.current = true;
        setPageReloadNonce((nonce) => nonce + 1);
        setStartRank(1);
        return;
      }
      pendingScrollToTopRef.current = false;
      pendingFocusLastRef.current = false;
      pendingScrollDirectionRef.current =
        normalizedRank < currentRank
          ? -1
          : normalizedRank > currentRank
          ? 1
          : null;
      const nextStart = pageStartForSubRank(normalizedRank) + 1;
      // Only preserve a continuous list when the requested page is exactly
      // adjacent. Distant navigation replaces the current page window.
      let appendNavigation = false;
      if (pendingScrollDirectionRef.current === 1)
        appendNavigation = nextStart === nextPageStart;
      else if (pendingScrollDirectionRef.current === -1)
        appendNavigation = nextStart === previousPageStart;
      pendingNavigationAppendRef.current = appendNavigation;
      const firstLoadedRank = entries[0]?.subRank ?? Number.POSITIVE_INFINITY;
      const lastLoadedRank = entries.at(-1)?.subRank ?? 0;
      if (
        normalizedRank >= firstLoadedRank &&
        normalizedRank <= lastLoadedRank
      ) {
        const requestedTargetIndex = entries.findIndex(
          (entry) => entry.subRank >= normalizedRank
        );
        const targetIndex =
          requestedTargetIndex >= 0
            ? requestedTargetIndex
            : pendingScrollDirectionRef.current === -1
            ? 0
            : Math.max(0, entries.length - 1);
        scrollToEntry({
          state: scrollAnimationStateRef.current,
          list: listRef.current,
          index: targetIndex,
          alignment: "top",
          requestedBehavior: "smooth",
          requestedDuration: getScrollAnimationDuration(
            Math.abs(normalizedRank - currentRank)
          ),
          targetOffset: () =>
            rowVirtualizer.getOffsetForIndex(targetIndex, "start")?.[0],
        });
        pendingScrollDirectionRef.current = null;
        return;
      }
      preserveListDuringLoadRef.current = true;
      setPreserveListDuringLoad(true);
      setStartRank(nextStart);
    },
    [
      entries,
      findQuery,
      lastRank,
      nextPageStart,
      previousPageStart,
      resetFind,
      rowVirtualizer,
      total,
    ]
  );

  const jumpToEnd = useCallback(() => {
    navigationEpochRef.current += 1;
    cancelScrollAnimation(scrollAnimationStateRef.current);
    pendingNavigationAppendRef.current = false;
    setLoading(false);
    const endRank = lastRank ?? (Number.isFinite(total) ? total : visibleSubRank);
    const nextStart = pageStartForSubRank(endRank) + 1;
    const currentRank = getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
    navigationTargetRankRef.current = endRank;
    pendingRankRef.current = endRank;
    pendingScrollToTopRef.current = false;
    pendingFocusLastRef.current = true;
    pendingScrollDirectionRef.current =
      endRank < currentRank ? -1 : endRank > currentRank ? 1 : null;
    if (!hasMore && entries.length > 0) {
      const targetIndex = Math.max(0, entries.length - 1);
      scrollToEntry({
        state: scrollAnimationStateRef.current,
        list: listRef.current,
        index: targetIndex,
        alignment: "bottom",
        bottomOffset: END_MARKER_PEEK,
        requestedBehavior: "smooth",
        requestedDuration: getScrollAnimationDuration(
          Math.abs(endRank - currentRank)
        ),
      });
      pendingScrollDirectionRef.current = null;
      pendingFocusLastRef.current = false;
      return;
    }
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setStartRank(nextStart);
  }, [
    entries.length,
    hasMore,
    lastRank,
    total,
    visibleSubRank,
  ]);

  const getNavigationBaseSubRank = useCallback(() => {
    const navigationInProgress =
      scrollAnimationStateRef.current.active ||
      scrollAnimationStateRef.current.programmatic ||
      preserveListDuringLoadRef.current;
    if (navigationInProgress && navigationTargetRankRef.current !== null)
      return navigationTargetRankRef.current;
    return getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
  }, []);

  const handleJumpUp = () => {
    if (visibleSubRank <= 5000) {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
      resetToRank(1);
      return;
    }
    if (jumpUpArmedRef.current) {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
      resetToRank(1);
      return;
    }
    jumpDownArmedRef.current = false;
    setJumpDownArmed(false);
    if (jumpDownTimerRef.current !== null)
      window.clearTimeout(jumpDownTimerRef.current);
    jumpDownTimerRef.current = null;
    jumpUpArmedRef.current = true;
    jumpUpTimerRef.current = window.setTimeout(() => {
      jumpUpTimerRef.current = null;
      jumpUpArmedRef.current = false;
      setJumpUpArmed(false);
    }, 500);
    setJumpUpArmed(true);
    resetToRank(getNavigationBaseSubRank() - 5000);
  };

  const handleJumpDown = () => {
    if (Number.isFinite(total) && visibleSubRank >= total - 5000) {
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
      jumpToEnd();
      return;
    }
    if (jumpDownArmedRef.current) {
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
      jumpToEnd();
      return;
    }
    jumpUpArmedRef.current = false;
    setJumpUpArmed(false);
    if (jumpUpTimerRef.current !== null)
      window.clearTimeout(jumpUpTimerRef.current);
    jumpUpTimerRef.current = null;
    jumpDownArmedRef.current = true;
    jumpDownTimerRef.current = window.setTimeout(() => {
      jumpDownTimerRef.current = null;
      jumpDownArmedRef.current = false;
      setJumpDownArmed(false);
    }, 500);
    setJumpDownArmed(true);
    resetToRank(getNavigationBaseSubRank() + 5000);
  };

  useEffect(
    () => () => {
      if (jumpUpTimerRef.current !== null)
        window.clearTimeout(jumpUpTimerRef.current);
      if (jumpDownTimerRef.current !== null)
        window.clearTimeout(jumpDownTimerRef.current);
      jumpUpArmedRef.current = false;
      jumpDownArmedRef.current = false;
    },
    []
  );

  const resetToRankRef = useRef(resetToRank);
  const jumpToEndRef = useRef(jumpToEnd);
  useEffect(() => {
    resetToRankRef.current = resetToRank;
    jumpToEndRef.current = jumpToEnd;
  }, [jumpToEnd, resetToRank]);

  useEffect(() => {
    const onDocumentBoundaryKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if (isEditable || event.altKey || event.shiftKey) return;

      const jumpToTop =
        (event.metaKey && !event.ctrlKey && event.key === "ArrowUp") ||
        (event.ctrlKey && !event.metaKey && event.key === "Home");
      const jumpToBottom =
        (event.metaKey && !event.ctrlKey && event.key === "ArrowDown") ||
        (event.ctrlKey && !event.metaKey && event.key === "End");

      if (!jumpToTop && !jumpToBottom) return;

      event.preventDefault();
      if (event.repeat) return;

      if (jumpToTop) resetToRankRef.current(1);
      else jumpToEndRef.current();
    };

    window.addEventListener("keydown", onDocumentBoundaryKeyDown);
    return () =>
      window.removeEventListener("keydown", onDocumentBoundaryKeyDown);
  }, []);

  const executeVimCommand = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim();
      const lowerCommand = command.toLocaleLowerCase();
      const currentRank = getNavigationBaseSubRank();

      if (command === "G" || command === "$" || lowerCommand === "end") {
        jumpToEndRef.current();
      } else if (command === "gg" || lowerCommand === "top") {
        resetToRankRef.current(1);
      } else if (
        command === "j" ||
        command === "d" ||
        lowerCommand === "down" ||
        lowerCommand === "pagedown"
      ) {
        resetToRankRef.current(currentRank + VIM_JUMP_SIZE);
      } else if (
        command === "k" ||
        command === "u" ||
        lowerCommand === "up" ||
        lowerCommand === "pageup"
      ) {
        resetToRankRef.current(currentRank - VIM_JUMP_SIZE);
      } else if (/^[+-]\d+$/.test(command)) {
        resetToRankRef.current(currentRank + Number(command));
      } else if (/^\d[\d,]*$/.test(command)) {
        resetToRankRef.current(Number(command.replaceAll(",", "")));
      }
    },
    [getNavigationBaseSubRank]
  );

  useEffect(() => {
    const onVimKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if (event.key === "Escape" && (vimMode || vimSearchActive)) {
        event.preventDefault();
        cancelVimSearch();
        return;
      }

      if (!vimMode) {
        const directVimCommand = event.key.toLocaleLowerCase();
        if (
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ["j", "k", "d", "u"].includes(directVimCommand)
        ) {
          event.preventDefault();
          executeVimCommand(directVimCommand);
          return;
        }
        if (
          (event.key === ":" || event.key === "/") &&
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          setVimMode(true);
          setVimHelpOpen(false);
          setFindOpen(false);
          if (event.key === "/" && !vimSearchActive) resetFind();
          setVimCommand(
            event.key === "/" && vimSearchActive
              ? `/${vimSearchQuery}`
              : event.key
          );
        }
        return;
      }

      const editingVimSearch =
        isEditable && vimCommand.startsWith("/");
      if (editingVimSearch && event.key !== "Enter" && event.key !== "Escape") {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.key.length !== 1 &&
        !["Enter", "Escape", "Backspace"].includes(event.key)
      )
        return;

      event.preventDefault();
      if (vimCommand.startsWith("/")) {
        if (event.key === "Enter") {
          const regexQuery = vimCommand.slice(1).trim();
          if (regexQuery) {
            setRegexSearch(true);
            updateQueryParams({ search: regexQuery, mode: "vim" });
            setFindResolvedQuery("");
            setFindQuery(regexQuery);
            setVimSearchActive(true);
            setVimSearchQuery(regexQuery);
            setFindOpen(false);
            vimInputRef.current?.blur();
          }
          setVimMode(false);
          setVimCommand(":");
        } else if (event.key === "Backspace") {
          setVimCommand((current) => current.length > 1 ? current.slice(0, -1) : current);
        } else if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          setVimCommand((current) => current + event.key);
        }
        return;
      }
      const directVimCommand =
        event.key === "G" ? "G" : event.key.toLocaleLowerCase();
      if (
        vimCommand === ":" &&
        ["j", "k", "d", "u", "G"].includes(directVimCommand)
      ) {
        executeVimCommand(directVimCommand);
        setVimCommand(":");
        return;
      }
      if (vimCommand === ":g" && event.key === "g") {
        executeVimCommand("gg");
        setVimCommand(":");
        return;
      }
      if (event.key === "Escape") {
        setVimMode(false);
        setVimHelpOpen(false);
        setVimCommand(":");
      } else if (event.key === "Enter") {
        executeVimCommand(vimCommand.slice(1));
        setVimMode(false);
        setVimCommand(":");
      } else if (event.key === "Backspace") {
        setVimCommand((current) =>
          current.length > 1 ? current.slice(0, -1) : current
        );
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        setVimCommand((current) => current + event.key);
      }
    };

    window.addEventListener("keydown", onVimKeyDown);
    return () => window.removeEventListener("keydown", onVimKeyDown);
  }, [
    cancelVimSearch,
    executeVimCommand,
    resetFind,
    vimCommand,
    vimMode,
    vimSearchActive,
    vimSearchQuery,
  ]);

  useEffect(() => {
    vimCommandRef.current = vimCommand;
  }, [vimCommand]);

  useEffect(() => {
    if (!vimMode || !vimCommandRef.current.startsWith("/")) return;
    window.requestAnimationFrame(() => {
      vimInputRef.current?.focus();
      const end = vimInputRef.current?.value.length ?? 0;
      vimInputRef.current?.setSelectionRange(end, end);
    });
  }, [vimMode]);

  const changeRankingType = (nextRankingType: "single" | "average") => {
    if (
      nextRankingType === rankingType ||
      (eventId === "333mbf" && nextRankingType === "average")
    )
      return;
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    pendingScrollDirectionRef.current = null;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setRankingType(nextRankingType);
    updateQueryParams({
      result: nextRankingType === "single" ? null : nextRankingType,
      type: null,
    });
    setStartRank(1);
  };

  const changeEvent = (nextEventId: (typeof WCA_EVENTS)[number]["id"]) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setStartRank(1);
    setEventId(nextEventId);
    const nextRankingType = nextEventId === "333mbf" ? "single" : rankingType;
    setRankingType(nextRankingType);
    updateQueryParams({
      eventId: nextEventId === "333" ? null : nextEventId,
      result: nextRankingType === "single" ? null : nextRankingType,
      event: null,
      type: null,
    });
  };

  const changeRegion = (option: RegionOption) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setStartRank(1);
    setRegionSelection({ scope: option.scope, regionId: option.regionId });
    updateQueryParams({
      region: option.scope === "world" ? null : option.regionId,
      scope: null,
    });
  };

  const activateFind = () => {
    if (vimMode || vimSearchActive || regexSearch) resetFind();
    setVimSearchActive(false);
    setVimSearchQuery("");
    setRegexSearch(false);
    updateQueryParams({ mode: null });
    setFindOpen(true);
  };

  const openFind = () => {
    activateFind();
    window.requestAnimationFrame(() =>
      (tableReachedTop
        ? railFindInputRef.current
        : headerFindInputRef.current
      )?.focus()
    );
  };

  const changeFindQuery = (value: string) => {
    setVimSearchActive(false);
    setVimSearchQuery("");
    setRegexSearch(false);
    setFindResolvedQuery("");
    updateQueryParams({
      search: value.trim() ? value : null,
      mode: null,
    });
    setFindQuery(value);
  };

  const findPending =
    Boolean(findQuery.trim()) && findQuery.trim() !== findResolvedQuery;
  const searchMatchPersonIds = useMemo(
    () =>
      new Set(
        findResolvedQuery
          ? findMatches.map((match) => match.personId)
          : []
      ),
    [findMatches, findResolvedQuery]
  );
  const activeFindMatch = findMatches[findIndex] ?? null;
  const currentEvent = WCA_EVENTS.find((event) => event.id === eventId)!;

  return (
    <div
      className={`app${vimMode || vimSearchActive ? " app--vimMode" : ""}${
        findQuery.trim() ? " app--searching" : ""
      }`}
    >
      <header className="header">
        <div className="headerTopRow">
          <div className="headerTitle">
            <h1 className="title">
              <Link href="/">WCA Rankings</Link>
            </h1>
          </div>
          <div className="headerActions">
            <SearchInputs
              inputRef={setHeaderFindInputRef}
              findOpen={findOpen}
              findQuery={findQuery}
              findError={findError}
              findLoading={findLoading}
              findPending={findPending}
              findMatches={findMatches}
              findIndex={findIndex}
              activeFindMatch={activeFindMatch}
              onOpen={activateFind}
              onClose={closeFind}
              onQueryChange={changeFindQuery}
              onCycle={cycleFind}
            />
            <ThemeToggle />
          </div>
        </div>
        <RankingControls
          eventId={eventId}
          rankingType={rankingType}
          regions={regions}
          regionSelection={regionSelection}
          onEventChange={changeEvent}
          onRankingTypeChange={changeRankingType}
          onRegionChange={changeRegion}
          onEventPickerTrigger={(trigger) => {
            eventPickerTriggerRef.current = trigger;
          }}
        />
      </header>

      <main>
        <JumpControlsVisibility visible={tableReachedTop || jumpUpArmed}>
          <JumpUpControls
          armed={jumpUpArmed}
          navigationPending={preserveListDuringLoad}
          currentPosition={visibleSubRank}
          onJump={handleJumpUp}
          event={currentEvent}
          onEventChange={changeEvent}
          onEventPickerTrigger={(trigger) => {
            railEventPickerTriggerRef.current = trigger;
          }}
          searchInputRef={setRailFindInputRef}
          findQuery={findQuery}
          findError={findError}
          findLoading={findLoading}
          findPending={findPending}
          findMatches={findMatches}
          findIndex={findIndex}
          onSearchOpen={activateFind}
          onSearchClose={closeFind}
          onSearchQueryChange={changeFindQuery}
          onSearchCycle={cycleFind}
          />
        </JumpControlsVisibility>

        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {loadingPrevious && (
              <div className="listMessage">Loading earlier rankings…</div>
            )}
            {error ? (
              <div className="listMessage">{error}</div>
            ) : (
              <ResultsTable
                listRef={rankingListRef}
                entries={entries}
                renderedRows={renderedRows}
                renderedListHeight={renderedListHeight}
                listOffset={listOffset}
                eventId={eventId}
                rankingType={entriesRankingType}
                loading={loading}
                showLoading={showLoading}
                preserveListDuringLoad={preserveListDuringLoad}
                hasMore={hasMore}
                loadingMore={loadingMore}
                searchMatchPersonIds={searchMatchPersonIds}
                highlightedPersonId={highlightedPersonId}
                measureElement={rowVirtualizer.measureElement}
                onRowNavigate={handleRowNavigate}
              />
            )}
          </div>
        </div>

        <JumpControlsVisibility
          visible={
            jumpDownArmed ||
            (!atPageEnd && Number.isFinite(total) && visibleSubRank < total)
          }
        >
          <JumpDownControls
          armed={jumpDownArmed}
          navigationPending={preserveListDuringLoad}
          currentPosition={visibleSubRank}
          total={total}
          onJump={handleJumpDown}
          searchActive={findOpen && findMatches.length > 0}
          onSearchPrevious={() => cycleFind(-1)}
          onSearchNext={() => cycleFind(1)}
          />
        </JumpControlsVisibility>
      </main>
      {(vimMode || vimSearchActive) && (
        <VimSearchInput
          inputRef={vimInputRef}
          value={vimMode ? vimCommand : `/${vimSearchQuery}`}
          vimMode={vimMode}
          vimSearchActive={vimSearchActive}
          findLoading={findLoading}
          findPending={findPending}
          findQuery={findQuery}
          activeFindMatch={activeFindMatch}
          findMatches={findMatches}
          findIndex={findIndex}
          vimHelpOpen={vimHelpOpen}
          onChange={setVimCommand}
          onCycle={(direction) => {
            setFindOpen(false);
            cycleFind(direction);
          }}
          onToggleHelp={() => setVimHelpOpen((open) => !open)}
        />
      )}
      {(vimMode || vimSearchActive) && vimHelpOpen && (
        <VimHelp onClose={() => setVimHelpOpen(false)} />
      )}
      <footer className="siteFooter">
        <span>By Adam Walker and Cailyn Sinclair</span>
        {offlineStale && <span role="status">Offline cached rankings may be stale</span>}
        <span>
          {fetchedAt
            ? `fetched ${formatFetchedAgo(fetchedAt)}`
            : "fetched time unavailable"}
        </span>
      </footer>
    </div>
  );
}
