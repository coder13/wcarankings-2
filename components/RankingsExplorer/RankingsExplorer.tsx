"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  animateScrollTo,
  cancelScrollAnimation,
  clampTargetSubRank,
  getCurrentViewportPosition,
  getCurrentViewportSubRank,
  getEndSubRank,
  getPagerJumpTarget,
  getPrefetchRowCount,
  shouldPrefetchExtraPage,
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
  type GenderFilter,
  isRankingEventId,
  isRankingType,
  normalizeGenderFilters,
  parseRegionQuery,
  WCA_EVENTS,
} from "@/lib/wca";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  notifyAnalyticsNavigation,
  trackGoogleAnalyticsEvent,
} from "@/lib/google-analytics";
import { RankingsControlsRail, RankingsPagerRail } from "../RankingsRail/RankingsRail";
import {
  ALL_EVENT_RANKING_OPTIONS,
} from "../EventPicker/allEventRankingOptions";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { SubjectMockRows } from "./SubjectMockRows";
import { AppHeader } from "../AppHeader/AppHeader";
import { VimHelp } from "../VimHelp/VimHelp";
import { VimSearchInput } from "../VimSearchInput/VimSearchInput";
import {
  ExplorerSubjectSwitch,
  type ExplorerSubject,
  type NavigationSubject,
} from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { TextDropdown } from "../Dropdown/TextDropdown";
import { ListAddPeopleRail, ListMembershipControls, ListMembershipRequestRows, ListOwnerControls } from "../ListOwnerControls/ListOwnerControls";
import { ListCloneExportControls } from "../ListOwnerControls/ListCloneExportControls";
import { DynamicListControls } from "../ListOwnerControls/DynamicListControls";
import { useRailScrollProgress } from "./useRailScrollProgress";
import { fetchRankingPage, RankingsPageCache } from "./rankingsPageCache";
import { useScrollVelocity } from "./useScrollVelocity";
import { useRankingsExplorerState } from "./useRankingsExplorerState";
import { COMPETITION_RANKING_OPTIONS, type CompetitionRanking, type RankingResource } from "./helpers/rankingModes";
import { centeredRowScrollTop, getSearchScrollDirection, subjectPath } from "./helpers/navigation";
export { centeredRowScrollTop, getSearchScrollDirection, subjectPath } from "./helpers/navigation";
import {
  formatRankingsFreshness,
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
const MOBILE_CONTROLS_QUERY = "(max-width: 600px)";

function subscribeMobileControls(listener: () => void) {
  const media = window.matchMedia(MOBILE_CONTROLS_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function getMobileControlsSnapshot() {
  return window.matchMedia(MOBILE_CONTROLS_QUERY).matches;
}
const RAIL_REVEAL_DISTANCE = ROW_HEIGHT * 1.5;
const TOP_RAIL_TRANSFORM_DISTANCE = ROW_HEIGHT * 2;
const END_MARKER_PEEK = ROW_HEIGHT + 40;
type RankingSource =
  | { kind: "saved"; listId: string; listName: string }
  | { kind: "dynamic"; personIds: string[]; listName: string };

function addRankingSourceParams(params: URLSearchParams, source?: RankingSource) {
  if (!source) return;
  if (source.kind === "saved") params.set("list", source.listId);
  else params.set("wca_ids", source.personIds.join(","));
}

function rankingSourceCacheKey(source: RankingSource | undefined, resource: RankingResource) {
  if (!source) return resource;
  return source.kind === "saved" ? source.listId : `dynamic:${source.personIds.join(",")}`;
}
type VinextNavigationWindow = Window & {
  __VINEXT_RSC_PENDING__?: Promise<unknown> | null;
};


export function competitionRankingPath(ranking: CompetitionRanking) {
  return `/competitions/${ranking}`;
}

function rankingResource(
  subject: ExplorerSubject,
  competitionRanking: CompetitionRanking,
  latitudeHemisphere: "north" | "south" = "north",
): RankingResource {
  if (subject === "results") return "results";
  if (subject !== "competitions") return "people";
  if (competitionRanking === "latitude") return `latitude-${latitudeHemisphere}`;
  if (competitionRanking === "competitor-count") return "competitor-count";
  return competitionRanking === "podiums" ? "podiums" : "competitions";
}

function podiumRankingType(eventId: string): "single" | "average" {
  return ["333bf", "444bf", "555bf"].includes(eventId)
    ? "single"
    : "average";
}

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};


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
  notifyAnalyticsNavigation();
}

function setSearchQueryParam(value: string) {
  updateQueryParams({ search: value.trim() ? value : null });
}

type SearchLayoutAnchor = {
  requestEpoch: number;
  personId: string;
  viewportTop: number;
};

type PendingPersonFocus = {
  personId: string;
  animate: boolean;
};

const pageCache = new RankingsPageCache();

export function pageStartForSubRank(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE;
}

export function pageStartForViewportSubRank(subRank: number) {
  return pageStartForSubRank(subRank) + 1;
}

function activeYear() {
  return window.location.pathname.match(/^\/persons\/year\/(\d{4})$/)?.[1]
    ?? new URLSearchParams(window.location.search).get("year");
}

function getRenderedPersonTop(personId: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>(".listItem[data-person-id]")
  ).find((element) => element.dataset.personId === personId);
  return row ? row.getBoundingClientRect().top + window.scrollY : undefined;
}

export function shouldFallbackToFirstPage(
  startRank: number,
  entryCount: number
) {
  return startRank > 1 && entryCount === 0;
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
  selection: RegionSelection,
  resource: RankingResource = "people",
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
) {
  const pageStart = pageStartForSubRank(start);
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    start: String(pageStart),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  const year = activeYear();
  if (resource === "people" && year) params.set("year", year);
  addRankingSourceParams(params, source);
  if ((resource === "people" || resource === "results") && gender.length) params.set("gender", gender.join(","));
  if (selection.scope !== "world") params.set("region", selection.regionId);
  if (resource === "podiums") params.set("ranking", "podium");
  if (resource === "competitor-count") params.set("ranking", "competitor-count");
  if (resource.startsWith("latitude-")) {
    params.set("ranking", "latitude");
    params.set("hemisphere", resource.slice("latitude-".length));
  }
  const cacheKey = params.toString();
  const cachePool = `${rankingSourceCacheKey(source, resource)}:${eventId}`;
  const cached = pageCache.get(cachePool, cacheKey);
  if (cached) return cached;

  const endpoint = resource === "results"
    ? "/api/rankings/results"
    : resource !== "people"
      ? "/api/rankings/competitions"
      : "/api/rankings";
  const request = fetchRankingPage(`${endpoint}?${params}`).then(async (response) => {
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
      exportDate: data.exportDate ?? null,
      offlineStale: response.headers.get("X-Rankings-Offline-Stale") === "1",
    };
  });

  pageCache.set(cachePool, cacheKey, request, !source && selection.scope === "world" && pageStart === 0);
  request.catch(() => pageCache.delete(cachePool, cacheKey));
  return request;
}

async function getEndWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  endSubRank: number,
  resource: RankingResource = "people",
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
) {
  const finalPageStart = pageStartForSubRank(endSubRank);
  const pageStarts = [
    Math.max(0, finalPageStart - PAGE_SIZE),
    finalPageStart,
  ].filter((start, index, starts) => starts.indexOf(start) === index);
  const pages = await Promise.all(
    pageStarts.map((start) =>
      getPage(eventId, rankingType, start + 1, selection, resource, source, gender)
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

async function getPersonWindow(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  match: Pick<RankingEntry, "personId" | "subRank">,
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
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
      getPage(eventId, rankingType, start, selection, "people", source, gender)
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
  direction: -1 | 1,
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
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
        getPage(eventId, rankingType, start + 1, selection, "people", source, gender)
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
  currentMatchIndex: number,
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
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
      void getPersonWindow(eventId, rankingType, selection, match, source, gender).catch(
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
  signal: AbortSignal,
  source?: RankingSource,
  resource: RankingResource = "people",
  gender: readonly GenderFilter[] = [],
) {
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    search,
    searchLimit: "500",
  });
  if (regexSearch) params.set("mode", "vim");
  addRankingSourceParams(params, source);
  const year = activeYear();
  if (resource === "people" && year) params.set("year", year);
  if ((resource === "people" || resource === "results") && gender.length) params.set("gender", gender.join(","));
  if (selection.scope !== "world") params.set("region", selection.regionId);

  const endpoint = resource === "results" ? "/api/rankings/results" : "/api/rankings";
  return fetch(`${endpoint}?${params}`, { signal }).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Search is unavailable.");
    }
    return response.json() as Promise<{ entries: RankingEntry[] }>;
  });
}

function locateRanking(
  eventId: string,
  rankingType: "single" | "average",
  selection: RegionSelection,
  wcaId: string,
  source?: RankingSource,
  gender: readonly GenderFilter[] = [],
) {
  const params = new URLSearchParams({
    eventId,
    result: rankingType,
    locate: wcaId,
  });
  addRankingSourceParams(params, source);
  if (gender.length) params.set("gender", gender.join(","));
  if (selection.scope !== "world") params.set("region", selection.regionId);
  return fetch(`/api/rankings?${params}`).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      throw new Error(body.error ?? "Could not find this person in the rankings.");
    }
    return response.json() as Promise<{ located: RankingEntry | null }>;
  });
}

export function RankingsExplorer({
  initialData,
  initialSearch = "",
  initialRegexSearch = initialData?.regexSearch ?? false,
  initialEventId = "333",
  initialRankingType = "single",
  initialGender = [],
  initialYear: _initialYear = null,
  initialRegionSelection = { scope: "world", regionId: "" },
  showAllEventRankingOptions = false,
  showSubjectSwitch = false,
  initialSubject = "people",
  initialCompetitionRanking = "best-result",
  initialLatitudeHemisphere = "north",
  mockSubjectRows = false,
  rankingSource,
  showMyRank = true,
  listOwner,
  listMembership,
  listMembershipRequests,
  listActions,
  dynamicList,
  listNotice,
  regionSelectionDisabled = false,
  initialRegions = {
    continents: FALLBACK_CONTINENTS,
    countries: FALLBACK_COUNTRIES,
  },
}: {
  initialData?: InitialRankingData;
  initialSearch?: string;
  initialRegexSearch?: boolean;
  initialEventId?: (typeof WCA_EVENTS)[number]["id"] | "SOR" | "sor-kinch";
  initialRankingType?: "single" | "average";
  initialGender?: readonly GenderFilter[];
  initialYear?: number | null;
  initialRegionSelection?: RegionSelection;
  showAllEventRankingOptions?: boolean;
  showSubjectSwitch?: boolean;
  initialSubject?: ExplorerSubject;
  initialCompetitionRanking?: CompetitionRanking;
  initialLatitudeHemisphere?: "north" | "south";
  mockSubjectRows?: boolean;
  rankingSource?: RankingSource;
  showMyRank?: boolean;
  listOwner?: {
    listId: string;
    visibility: "public" | "private";
    joinPolicy: "open" | "closed";
  };
  listMembership?: {
    listId: string;
    joinPolicy: "open" | "closed";
    state: "member" | "pending" | "not_member";
  };
  listMembershipRequests?: {
    listId: string;
    requests: Array<{ id: number; personId: string; name: string }>;
  };
  listActions?: { listId: string; isOwner: boolean };
  dynamicList?: { personIds: string[] };
  listNotice?: string;
  regionSelectionDisabled?: boolean;
  initialRegions?: {
    continents: Array<{ id: string; name: string }>;
    countries: Array<{ id: string; name: string; iso2?: string }>;
  };
}) {
  const router = useRouter();
  const isMobileControls = useSyncExternalStore(
    subscribeMobileControls,
    getMobileControlsSnapshot,
    () => false,
  );
  const normalizedInitialSearch = initialSearch.trim();
  const {
    eventId, setEventId, rankingType, setRankingType, regionSelection, setRegionSelection,
    subject, setSubject, competitionRanking, setCompetitionRanking,
    latitudeHemisphere, setLatitudeHemisphere, listAddOpen, setListAddOpen,
    memberSelectionMode, setMemberSelectionMode, selectedMemberIds, setSelectedMemberIds,
  } = useRankingsExplorerState({
    eventId: initialEventId,
    rankingType: initialRankingType,
    regionSelection: initialRegionSelection,
    subject: initialSubject,
    competitionRanking: initialCompetitionRanking,
    latitudeHemisphere: initialLatitudeHemisphere,
  });
  const [gender, setGender] = useState<readonly GenderFilter[]>(initialGender);
  const navigateToPage = useCallback((path: string) => {
    const navigate = () => router.push(path);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (!document.startViewTransition || reduceMotion) {
      navigate();
      return;
    }
    document.startViewTransition(async () => {
      navigate();
      await Promise.resolve();
      await (window as VinextNavigationWindow).__VINEXT_RSC_PENDING__;
    });
  }, [router]);
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
  const [exportDate, setExportDate] = useState<string | null>(
    initialData?.exportDate ?? null
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
  const [pagerNavigationBusy, setPagerNavigationBusy] = useState(false);
  const [memberRemovalOpen, setMemberRemovalOpen] = useState(false);
  const [memberRemovalBusy, setMemberRemovalBusy] = useState(false);
  const [memberRemovalError, setMemberRemovalError] = useState("");
  const [memberRemovalPersonIds, setMemberRemovalPersonIds] = useState<string[]>([]);
  const [memberContextMenu, setMemberContextMenu] = useState<{
    personId: string;
    x: number;
    y: number;
  } | null>(null);
  const { topProgress: topRailProgress, bottomProgress: bottomRailProgress } = useRailScrollProgress({ enabled: true, revealDistance: RAIL_REVEAL_DISTANCE, transformDistance: TOP_RAIL_TRANSFORM_DISTANCE });
  const [debugScrollY, setDebugScrollY] = useState(0);
  const activeListKey = [
    subject,
    competitionRanking,
    latitudeHemisphere,
    eventId,
    rankingType,
    gender.join(","),
    regionSelection.scope,
    regionSelection.regionId,
  ].join(":");
  const listRef = useRef<HTMLDivElement>(null);
  const stickyRankingsRailRef = useRef<HTMLDivElement>(null);
  const railFindInputRef = useRef<HTMLInputElement>(null);
  const setRailFindInputRef = useCallback((input: HTMLInputElement | null) => {
    railFindInputRef.current = input;
  }, []);
  const vimInputRef = useRef<HTMLInputElement>(null);
  const vimCommandRef = useRef(vimCommand);
  const moreRequestRef = useRef(false);
  const previousRequestRef = useRef(false);
  const navigationEpochRef = useRef(0);
  const activeListKeyRef = useRef(activeListKey);
  const focusResolutionEpochRef = useRef(0);
  const focusedWcaIdRef = useRef("");
  const lastFocusRequestRef = useRef("");
  const pendingPersonFocusRef = useRef<PendingPersonFocus | null>(null);
  const pendingRankRef = useRef(1);
  const pendingFocusLastRef = useRef(false);
  const pendingScrollToTopRef = useRef(false);
  const pendingScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const pendingNavigationAppendRef = useRef(false);
  const navigationTargetRankRef = useRef<number | null>(null);
  const pagerNavigationBusyRef = useRef(false);
  const preserveListDuringLoadRef = useRef(false);
  const initialPageKeyRef = useRef(
    initialData
      ? [
          initialSubject,
          initialCompetitionRanking,
          initialLatitudeHemisphere,
          initialEventId,
          initialRankingType,
          initialRegionSelection.scope,
          initialRegionSelection.regionId,
          initialData.startRank ?? 1,
        ].join(":")
      : ""
  );
  const forcePageLoadRef = useRef(false);
  const skipNextFindResetRef = useRef(false);
  const skipPageLoadStartRef = useRef<number | null>(null);
  const pendingFirstPageFallbackRef = useRef(false);
  const initialScrollRef = useRef(
    Boolean(
      initialData && initialData.initialMatchPersonId
    )
  );
  const initialSearchRef = useRef(
    Boolean(initialData && normalizedInitialSearch)
  );
  const initialFocusRef = useRef(
    Boolean(initialData?.initialMatchPersonId && !normalizedInitialSearch)
  );
  const findMatchesRef = useRef<RankingEntry[]>(
    orderSearchMatches(initialData?.searchMatches ?? [])
  );
  const findIndexRef = useRef(initialData?.searchMatches.length ? 0 : -1);
  const rankingListRef = useRef<HTMLOListElement>(null);
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
  const scrollVelocityRef = useScrollVelocity();
  const finishPagerNavigation = useCallback(() => {
    pagerNavigationBusyRef.current = false;
    setPagerNavigationBusy(false);
  }, []);
  const removeSelectedMembers = async () => {
    if (!listOwner || memberRemovalPersonIds.length === 0) return;
    setMemberRemovalBusy(true);
    setMemberRemovalError("");
    try {
      const responses = await Promise.all(
        memberRemovalPersonIds.map((personId) =>
          fetch(`/api/lists/${listOwner.listId}/members/${personId}`, {
            method: "DELETE",
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        throw new Error("Could not remove every selected person.");
      }
      setSelectedMemberIds(new Set());
      setMemberSelectionMode(false);
      window.location.reload();
    } catch (error) {
      setMemberRemovalError(
        error instanceof Error ? error.message : "Could not remove people.",
      );
      setMemberRemovalBusy(false);
    }
  };
  useEffect(() => {
    if (!memberContextMenu) return;
    const closeContextMenu = () => setMemberContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [memberContextMenu]);
  const queuePersonFocus = useCallback((personId: string, animate: boolean) => {
    setHighlightedPersonId(personId);
    pendingPersonFocusRef.current = { personId, animate };
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: entries.length + 1,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listOffset,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const update = () => setDebugScrollY(window.scrollY);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    activeListKeyRef.current = activeListKey;
  }, [activeListKey]);
  const virtualRows = rowVirtualizer.getVirtualItems();

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

  useLayoutEffect(() => {
    const measure = () => {
      const wrapperTop = listRef.current
        ? listRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
      const listTop = rankingListRef.current?.offsetTop ?? 0;
      setListOffset(wrapperTop + listTop);
      rowVirtualizerRef.current.measure();
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [entries.length, eventId, loading, loadingPrevious, rankingType, regionSelection]);

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
            getRenderedPersonTop(initialData.initialMatchPersonId) ??
            rowVirtualizerRef.current.getOffsetForIndex(targetIndex, "start")?.[0],
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
    const syncStateFromUrl = () => {
      const url = new URL(window.location.href);
      const nextEventId =
        url.searchParams.get("eventId") ?? url.searchParams.get("event");
      const nextRankingType =
        url.searchParams.get("result") ?? url.searchParams.get("type");
      const nextRegion = url.searchParams.get("region");
      const nextLatitudeHemisphere =
        url.searchParams.get("hemisphere") === "south" ? "south" : "north";
      const search = url.searchParams.get("search") ?? "";
      const resolvedEventId = isRankingEventId(nextEventId) ? nextEventId : "333";
      const resolvedRankingType = initialSubject === "competitions" &&
        initialCompetitionRanking === "podiums"
          ? podiumRankingType(resolvedEventId)
          : resolvedEventId === "333mbf"
          ? "single"
          : isRankingType(nextRankingType)
          ? nextRankingType
          : "single";
      const { scope, regionId } = parseRegionQuery(nextRegion);
      setEventId(resolvedEventId);
      setRankingType(resolvedRankingType);
      setRegionSelection({ scope, regionId });
      setLatitudeHemisphere(nextLatitudeHemisphere);
      setFindQuery(search);
      const nextRegexSearch = url.searchParams.get("mode") === "vim" && Boolean(search.trim());
      setRegexSearch(nextRegexSearch);
      setVimSearchActive(nextRegexSearch);
      setVimSearchQuery(nextRegexSearch ? search : "");
      setFindOpen(Boolean(search.trim() && !nextRegexSearch));
      updateQueryParams({
        eventId:
          resolvedEventId === "333" ? null : resolvedEventId,
        result:
          initialSubject === "competitions" &&
          initialCompetitionRanking === "podiums"
            ? null
            : resolvedRankingType === "single"
              ? null
              : resolvedRankingType,
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
      subject,
      competitionRanking,
      latitudeHemisphere,
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
    let redirectedToFirstPage = false;
    const requestNavigationEpoch = navigationEpochRef.current;
    const shouldFallbackToTop = pendingFirstPageFallbackRef.current;
    const preserveList = preserveListDuringLoadRef.current;
    // This reset is coupled to the request started immediately below.
    setLoading(true);
    if (!preserveList) {
      setEntries([]);
      setNextPageStart(null);
      setPreviousPageStart(null);
      setHasMore(true);
    }
    setError("");
    moreRequestRef.current = false;
    previousRequestRef.current = false;
    const focusLast = pendingFocusLastRef.current;
    pendingFocusLastRef.current = false;
    const personFocus = pendingPersonFocusRef.current;
    const focusMatch = personFocus
      ? { personId: personFocus.personId, subRank: pendingRankRef.current }
      : null;
    const resource = rankingResource(subject, competitionRanking, latitudeHemisphere);
    const pageRequest = focusLast
      ? getEndWindow(eventId, rankingType, regionSelection, startRank, resource, rankingSource, gender)
      : focusMatch
        ? getPersonWindow(eventId, rankingType, regionSelection, focusMatch, rankingSource, gender)
      : getPage(eventId, rankingType, startRank, regionSelection, resource, rankingSource, gender);
    pageRequest
      .then((data) => {
        if (
          !active ||
          requestNavigationEpoch !== navigationEpochRef.current
        )
          return;
        if (
          shouldFallbackToTop &&
          shouldFallbackToFirstPage(startRank, data.entries.length)
        ) {
          redirectedToFirstPage = true;
          pendingFirstPageFallbackRef.current = false;
          pendingRankRef.current = 1;
          pendingScrollToTopRef.current = true;
          pendingScrollDirectionRef.current = null;
          pendingNavigationAppendRef.current = false;
          preserveListDuringLoadRef.current = true;
          setPreserveListDuringLoad(true);
          setStartRank(1);
          return;
        }
        if (shouldFallbackToTop) pendingFirstPageFallbackRef.current = false;
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
        const appendNavigation =
          pendingNavigationAppendRef.current &&
          !scrollToTop &&
          !focusLast &&
          !focusMatch &&
          Boolean(pendingDirection);
        const previousEntries = entriesRef.current;
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
        setExportDate(data.exportDate ?? null);
        setOfflineStale(Boolean(data.offlineStale));
        const focusedTargetIndex = personFocus
          ? loadedEntries.findIndex((entry) => entry.personId === personFocus.personId)
          : -1;
        const requestedTargetIndex = focusLast
          ? Math.max(0, loadedEntries.length - 1)
          : focusedTargetIndex >= 0
            ? focusedTargetIndex
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
            appendNavigation ||
            focusedTargetIndex >= 0
        );
        if (focusedTargetIndex >= 0) pendingPersonFocusRef.current = null;
        pendingScrollDirectionRef.current = null;
        if (scrollToTop) {
          animateScrollTo(
            scrollAnimationStateRef.current,
            0,
            "smooth",
            getScrollAnimationDuration(currentPosition),
            pagerNavigationBusyRef.current
              ? finishPagerNavigation
              : undefined
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
              alignment: focusLast
                ? "bottom"
                : focusedTargetIndex >= 0
                  ? "center"
                  : "top",
              bottomOffset: focusLast ? END_MARKER_PEEK : 0,
              requestedBehavior:
                focusedTargetIndex >= 0 && !personFocus?.animate
                  ? "auto"
                  : "smooth",
              requestedDuration: getScrollAnimationDuration(
                Math.abs(rankForStep - currentSubRank)
              ),
              targetOffset: focusLast
                ? undefined
                : () =>
                    (personFocus
                      ? getRenderedPersonTop(personFocus.personId)
                      : undefined) ??
                    rowVirtualizerRef.current.getOffsetForIndex(
                      targetIndex,
                      "start"
                    )?.[0],
              onComplete: pagerNavigationBusyRef.current
                ? finishPagerNavigation
                : undefined,
            });
          });

        }
      })
      .catch((requestError: unknown) => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          if (shouldFallbackToTop) pendingFirstPageFallbackRef.current = false;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Rankings are unavailable."
          );
          finishPagerNavigation();
        }
      })
      .finally(() => {
        if (
          active &&
          requestNavigationEpoch === navigationEpochRef.current
        ) {
          if (redirectedToFirstPage) return;
          setLoading(false);
          preserveListDuringLoadRef.current = false;
          setPreserveListDuringLoad(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    competitionRanking,
    eventId,
    latitudeHemisphere,
    rankingType,
    regionSelection,
    pageReloadNonce,
    startRank,
    subject,
    finishPagerNavigation,
    rankingSource,
    gender,
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
        findIndexRef.current,
        rankingSource,
        gender,
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
              scrollDirection,
              rankingSource,
              gender,
            )
          : getPersonWindow(eventId, rankingType, regionSelection, match, rankingSource, gender);

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
          setExportDate(data.exportDate ?? null);
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
    [eventId, gender, rankingType, regionSelection, rankingSource]
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
    const isInitialFocus = initialFocusRef.current && !normalizedQuery;
    const skipNavigationReset = skipNextFindResetRef.current;
    skipNextFindResetRef.current = false;
    const hasActiveOrResolvedSearch = Boolean(
      normalizedQuery || findResolvedQuery || findMatchesRef.current.length,
    );
    if (
      hasActiveOrResolvedSearch &&
      !isInitialSearch &&
      !isInitialFocus &&
      !skipNavigationReset
    ) {
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
        if (isInitialFocus) {
          initialFocusRef.current = false;
          setFindResolvedQuery("");
          setFindLoading(false);
          return;
        }
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
          controller.signal,
          rankingSource,
          rankingResource(subject, competitionRanking, latitudeHemisphere),
          gender,
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
    competitionRanking,
    eventId,
    findQuery,
    findResolvedQuery,
    normalizedInitialSearch,
    rankingType,
    regionSelection,
    regexSearch,
    jumpToMatch,
    rankingSource,
    gender,
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
          const input = railFindInputRef.current;
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
        const trigger = railEventPickerTriggerRef.current;
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
    const requestListKey = activeListKeyRef.current;
    moreRequestRef.current = true;
    setLoadingMore(true);
    try {
      const connection = (navigator as Navigator & {
        connection?: NetworkInformationLike;
      }).connection;
      const followingPageStart = nextPageStart + PAGE_SIZE;
      if (
        followingPageStart <= total &&
        shouldPrefetchExtraPage({
          downwardPixelsPerMs: scrollVelocityRef.current.downwardPixelsPerMs,
          saveData: connection?.saveData,
          effectiveType: connection?.effectiveType,
        })
      ) {
        void getPage(
          eventId,
          rankingType,
          followingPageStart,
          regionSelection,
          rankingResource(subject, competitionRanking, latitudeHemisphere),
          rankingSource,
          gender,
        ).catch(() => undefined);
      }
      const data = await getPage(
        eventId,
        rankingType,
        nextPageStart,
        regionSelection,
        rankingResource(subject, competitionRanking, latitudeHemisphere),
        rankingSource,
        gender,
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        requestListKey !== activeListKeyRef.current ||
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
      setExportDate(data.exportDate ?? null);
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
  }, [competitionRanking, eventId, gender, hasMore, latitudeHemisphere, loading, nextPageStart, rankingSource, rankingType, regionSelection, subject, total]);

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
    const requestListKey = activeListKeyRef.current;
    previousRequestRef.current = true;
    setLoadingPrevious(true);
    const previousListHeight = rowVirtualizer.getTotalSize();
    try {
      const data = await getPage(
        eventId,
        rankingType,
        previousPageStart,
        regionSelection,
        rankingResource(subject, competitionRanking, latitudeHemisphere),
        rankingSource,
        gender,
      );
      if (
        requestEpoch !== navigationEpochRef.current ||
        requestListKey !== activeListKeyRef.current ||
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
      setExportDate(data.exportDate ?? null);
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
    competitionRanking,
    eventId,
    latitudeHemisphere,
    loading,
    previousPageStart,
    rankingType,
    regionSelection,
    rowVirtualizer,
    rankingSource,
    gender,
    subject,
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
    const prefetchRows = getPrefetchRowCount(scrollVelocityRef.current.downwardPixelsPerMs);
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - prefetchRows) {
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
    const cancelOnUserInput = () => {
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
      finishPagerNavigation();
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
  }, [finishPagerNavigation]);

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
    (rank: number, animate = true, focusedPersonId: string | null = null) => {
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
      const normalizedRank = clampTargetSubRank(rank, total, lastRank);
      const currentRank = getCurrentViewportSubRank(
        listRef.current,
        entriesRef.current,
        startRankRef.current
      );
      navigationTargetRankRef.current = normalizedRank;
      pendingRankRef.current = normalizedRank;
      if (focusedPersonId) queuePersonFocus(focusedPersonId, animate);
      else pendingPersonFocusRef.current = null;
      if (normalizedRank === 1) {
        if (findQuery.trim()) skipNextFindResetRef.current = true;
        resetFind();
        setFindOpen(false);
        pendingFocusLastRef.current = false;
        pendingScrollDirectionRef.current = null;
        pendingScrollToTopRef.current = animate;
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
      pendingScrollDirectionRef.current = animate
        ?
        normalizedRank < currentRank
          ? -1
          : normalizedRank > currentRank
          ? 1
          : null
        : null;
      // Rank values can be missing, so ask the API for the exact target and let
      // its ordered query choose the first real result at or beyond that rank.
      pendingNavigationAppendRef.current = Boolean(
        pendingScrollDirectionRef.current
      );
      const nextStart = pageStartForSubRank(normalizedRank) + 1;
      if (!animate) {
        preserveListDuringLoadRef.current = true;
        setPreserveListDuringLoad(true);
        if (nextStart === startRankRef.current) {
          forcePageLoadRef.current = true;
          setPageReloadNonce((nonce) => nonce + 1);
        }
        setStartRank(nextStart);
        return;
      }
      const firstLoadedRank = entries[0]?.subRank ?? Number.POSITIVE_INFINITY;
      const lastLoadedRank = entries.at(-1)?.subRank ?? 0;
      if (
        normalizedRank >= firstLoadedRank &&
        normalizedRank <= lastLoadedRank
      ) {
        const focusedTargetIndex = focusedPersonId
          ? entries.findIndex((entry) => entry.personId === focusedPersonId)
          : -1;
        const requestedTargetIndex = focusedTargetIndex >= 0
          ? focusedTargetIndex
          : entries.findIndex((entry) => entry.subRank >= normalizedRank);
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
          alignment: focusedTargetIndex >= 0 ? "center" : "top",
          requestedBehavior: "smooth",
          requestedDuration: getScrollAnimationDuration(
            Math.abs(normalizedRank - currentRank)
          ),
          targetOffset: () =>
            (focusedPersonId
              ? getRenderedPersonTop(focusedPersonId)
              : undefined) ??
            rowVirtualizer.getOffsetForIndex(targetIndex, "start")?.[0],
          onComplete: pagerNavigationBusyRef.current
            ? finishPagerNavigation
            : undefined,
        });
        pendingPersonFocusRef.current = null;
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
      queuePersonFocus,
      resetFind,
      rowVirtualizer,
      startRank,
      total,
      finishPagerNavigation,
    ]
  );

  const focusWcaId = useCallback((wcaId: string, animate = true) => {
    if (subject !== "people") return;
    const resolutionEpoch = focusResolutionEpochRef.current + 1;
    focusResolutionEpochRef.current = resolutionEpoch;
    setError("");
    void locateRanking(eventId, rankingType, regionSelection, wcaId, rankingSource, gender)
      .then(({ located }) => {
        if (resolutionEpoch !== focusResolutionEpochRef.current) return;
        if (!located) {
          resetToRank(1, false);
          return;
        }
        resetToRank(
          located.subRank,
          animate,
          located.personId,
        );
      })
      .catch((requestError: unknown) => {
        if (resolutionEpoch !== focusResolutionEpochRef.current) return;
        setError(requestError instanceof Error ? requestError.message : "Could not find this person in the rankings.");
      });
  }, [eventId, gender, rankingType, rankingSource, regionSelection, resetToRank, subject]);

  const focusMyRanking = useCallback((wcaId: string) => {
    focusedWcaIdRef.current = wcaId;
    updateQueryParams({ focus: "me", wcaId: null });
    lastFocusRequestRef.current = [
      eventId,
      rankingType,
      regionSelection.scope,
      regionSelection.regionId,
      "",
      "me",
    ].join(":");
    focusWcaId(wcaId);
  }, [eventId, focusWcaId, rankingType, regionSelection]);

  useEffect(() => {
    if (subject !== "people") return;
    const url = new URL(window.location.href);
    const explicitWcaId = url.searchParams.get("wcaId")?.trim().toUpperCase();
    const focusMe = url.searchParams.get("focus") === "me";
    const requestKey = [eventId, rankingType, regionSelection.scope, regionSelection.regionId, explicitWcaId ?? "", focusMe ? "me" : ""].join(":");
    if ((!explicitWcaId && !focusMe) || lastFocusRequestRef.current === requestKey) return;

    if (explicitWcaId) {
      lastFocusRequestRef.current = requestKey;
      void Promise.resolve().then(() => {
        if (lastFocusRequestRef.current === requestKey)
          focusWcaId(explicitWcaId, false);
      });
      return;
    }

    if (focusedWcaIdRef.current) {
      lastFocusRequestRef.current = requestKey;
      const wcaId = focusedWcaIdRef.current;
      void Promise.resolve().then(() => {
        if (lastFocusRequestRef.current === requestKey)
          focusWcaId(wcaId, false);
      });
      return;
    }

    const controller = new AbortController();
    fetch("/api/auth/wca/me", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your profile.");
        const { profile } = await response.json() as { profile: { wcaId: string } | null };
        if (!profile) throw new Error("Sign in with WCA to jump to your ranking.");
        focusedWcaIdRef.current = profile.wcaId;
        lastFocusRequestRef.current = requestKey;
        focusWcaId(profile.wcaId, false);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Could not load your profile.");
      });
    return () => controller.abort();
  }, [eventId, focusWcaId, rankingType, regionSelection, subject]);

  const jumpToEnd = useCallback(() => {
    const requestEpoch = navigationEpochRef.current + 1;
    navigationEpochRef.current = requestEpoch;
    cancelScrollAnimation(scrollAnimationStateRef.current);
    pendingNavigationAppendRef.current = false;
    setLoading(false);
    void getPage(
      eventId,
      rankingType,
      1,
      regionSelection,
      rankingResource(subject, competitionRanking, latitudeHemisphere),
      rankingSource,
      gender,
    )
      .then((boundaryPage) => {
        if (requestEpoch !== navigationEpochRef.current) return;
        const endRank = getEndSubRank(
          boundaryPage.total,
          boundaryPage.lastRank ?? lastRank,
          visibleSubRank
        );
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
        if (nextStart === startRankRef.current && entriesRef.current.length > 0) {
          scrollToEntry({
            state: scrollAnimationStateRef.current,
            list: listRef.current,
            index: entriesRef.current.length - 1,
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
      })
      .catch((requestError: unknown) => {
        if (requestEpoch !== navigationEpochRef.current) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Rankings are unavailable."
        );
      });
  }, [
    competitionRanking,
    eventId,
    latitudeHemisphere,
    lastRank,
    rankingType,
    rankingSource,
    gender,
    regionSelection,
    subject,
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
    if (pagerNavigationBusyRef.current) return;
    pagerNavigationBusyRef.current = true;
    setPagerNavigationBusy(true);
    const baseRank = getNavigationBaseSubRank();
    resetToRank(getPagerJumpTarget(baseRank, -1, total));
  };

  const handleJumpDown = () => {
    if (pagerNavigationBusyRef.current) return;
    pagerNavigationBusyRef.current = true;
    setPagerNavigationBusy(true);
    const baseRank = getNavigationBaseSubRank();
    resetToRank(getPagerJumpTarget(baseRank, 1, total));
  };

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
            trackGoogleAnalyticsEvent("ranking_search_used", {
              search_mode: "vim",
            });
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
      eventId === "333mbf" ||
      eventId === "sor-kinch"
    )
      return;
    const viewportSubRank = getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
    const nextStartRank = pageStartForViewportSubRank(viewportSubRank);
    pendingRankRef.current = viewportSubRank;
    pendingScrollToTopRef.current = false;
    pendingScrollDirectionRef.current = null;
    pendingFirstPageFallbackRef.current = true;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setRankingType(nextRankingType);
    trackGoogleAnalyticsEvent("ranking_result_type_changed", {
      result_type: nextRankingType,
    });
    updateQueryParams({
      result: nextRankingType === "single" ? null : nextRankingType,
      type: null,
    });
    setStartRank(nextStartRank);
  };

  const changeEvent = (
    nextEventId: (typeof WCA_EVENTS)[number]["id"] | "SOR" | "sor-kinch"
  ) => {
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    pendingScrollDirectionRef.current = null;
    pendingFirstPageFallbackRef.current = false;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    animateScrollTo(
      scrollAnimationStateRef.current,
      0,
      "smooth",
      getScrollAnimationDuration(Math.max(1, Math.round(window.scrollY / ROW_HEIGHT))),
    );
    setStartRank(1);
    setEventId(nextEventId);
    const nextRankingType =
      subject === "competitions" && competitionRanking === "podiums"
        ? podiumRankingType(nextEventId)
        : nextEventId === "333mbf" || nextEventId === "sor-kinch"
          ? "single"
          : rankingType;
    setRankingType(nextRankingType);
    trackGoogleAnalyticsEvent("ranking_event_changed", {
      event_id: nextEventId,
    });
    updateQueryParams({
      eventId: nextEventId === "333" ? null : nextEventId,
      result: nextEventId === "sor-kinch" || nextRankingType === "single" ? null : nextRankingType,
      event: null,
      type: null,
    });
  };

  const changeRegion = (option: RegionOption) => {
    const viewportSubRank = getCurrentViewportSubRank(
      listRef.current,
      entriesRef.current,
      startRankRef.current
    );
    const nextStartRank = pageStartForViewportSubRank(viewportSubRank);
    const nextSelection = { scope: option.scope, regionId: option.regionId };
    pendingFirstPageFallbackRef.current = true;
    pendingRankRef.current = viewportSubRank;
    pendingScrollToTopRef.current = false;
    pendingScrollDirectionRef.current = null;
    pendingNavigationAppendRef.current = false;
    skipNextFindResetRef.current = true;
    preserveListDuringLoadRef.current = true;
    setPreserveListDuringLoad(true);
    setStartRank(nextStartRank);
    setRegionSelection(nextSelection);
    trackGoogleAnalyticsEvent("ranking_scope_changed", {
      scope_type: option.scope,
    });
    updateQueryParams({
      region: option.scope === "world" ? null : option.regionId,
      scope: null,
    });
  };

  const changeGender = (nextGender: GenderFilter[]) => {
    const normalizedGender = normalizeGenderFilters(nextGender);
    if (normalizedGender.join(",") === gender.join(",")) return;
    pendingRankRef.current = 1;
    pendingScrollToTopRef.current = true;
    pendingScrollDirectionRef.current = null;
    pendingNavigationAppendRef.current = false;
    preserveListDuringLoadRef.current = false;
    setPreserveListDuringLoad(false);
    setStartRank(1);
    setGender(normalizedGender);
    updateQueryParams({ gender: normalizedGender.length ? normalizedGender.join(",") : null });
    trackGoogleAnalyticsEvent("ranking_gender_changed", {
      gender: normalizedGender.length ? normalizedGender.join(",") : "any",
    });
  };

  const changeSubject = (nextSubject: NavigationSubject) => {
    if (nextSubject === "lists") {
      navigateToPage("/lists");
      return;
    }
    if (nextSubject === subject) return;
    navigateToPage(subjectPath(nextSubject));
  };

  const activateFind = () => {
    if (vimMode || vimSearchActive || regexSearch) resetFind();
    setVimSearchActive(false);
    setVimSearchQuery("");
    setRegexSearch(false);
    updateQueryParams({ mode: null });
    setFindOpen(true);
  };

  const changeFindQuery = (value: string) => {
    if (!findQuery.trim() && value.trim()) {
      trackGoogleAnalyticsEvent("ranking_search_used", {
        search_mode: "standard",
      });
    }
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
  const currentEvent =
    ALL_EVENT_RANKING_OPTIONS.find((option) => option.id === eventId) ??
    WCA_EVENTS.find((event) => event.id === eventId)!;
  const changeRailEvent = (nextEventId: string) => {
    updateQueryParams({ personId: null });
    changeEvent(
      nextEventId as
        | (typeof WCA_EVENTS)[number]["id"]
        | "SOR"
        | "sor-kinch"
    );
  };
  const changeListSubject = (nextSubject: NavigationSubject) => {
    if (nextSubject === "lists") {
      navigateToPage("/lists");
      return;
    }
    changeSubject(nextSubject);
  };

  return (
    <div
      className={`app${vimMode || vimSearchActive ? " app--vimMode" : ""}${
        findQuery.trim() ? " app--searching" : ""
      }`}
    >
      <AppHeader>
        {rankingSource ? (
          <>
            <ExplorerSubjectSwitch subject="lists" onChange={changeListSubject} variant="text" />
            <span className="listRankingName">{rankingSource.listName}</span>
          </>
        ) : showSubjectSwitch && (
          <>
            <ExplorerSubjectSwitch
              subject={subject}
              onChange={changeSubject}
              variant="text"
            />
            {subject === "competitions" && (
              <TextDropdown
                options={COMPETITION_RANKING_OPTIONS}
                value={competitionRanking}
                onChange={(nextRanking) => {
                  if (nextRanking === competitionRanking) return;
                  navigateToPage(competitionRankingPath(nextRanking));
                }}
                ariaLabel="Competition ranking"
                className="competitionRankingDropdown"
              />
            )}
          </>
        )}
      </AppHeader>

      <div
        ref={stickyRankingsRailRef}
        className="stickyRankingsRail"
        style={{ "--rail-scroll-progress": topRailProgress } as CSSProperties}
      >
        {listOwner && <ListOwnerControls listId={listOwner.listId} initialVisibility={listOwner.visibility} initialJoinPolicy={listOwner.joinPolicy} onManageMembers={() => { setMemberSelectionMode(true); setSelectedMemberIds(new Set()); }} />}
        {listActions && !listActions.isOwner && <ListCloneExportControls listId={listActions.listId} />}
        {dynamicList && <DynamicListControls personIds={dynamicList.personIds} />}
        {listMembership && <ListMembershipControls listId={listMembership.listId} joinPolicy={listMembership.joinPolicy} initialState={listMembership.state} />}
        {listAddOpen && listOwner ? <ListAddPeopleRail listId={listOwner.listId} onCancel={() => setListAddOpen(false)} onAdded={() => { forcePageLoadRef.current = true; setStartRank(1); setStartPosition(0); setPageReloadNonce((nonce) => nonce + 1); }} /> : <RankingsControlsRail
          event={currentEvent}
          eventOptions={competitionRanking === "podiums"
            ? WCA_EVENTS.filter((event) => event.id !== "333mbf")
            : WCA_EVENTS}
          additionalEventOptions={showAllEventRankingOptions ? ALL_EVENT_RANKING_OPTIONS : undefined}
          onEventChange={changeRailEvent}
          rankingType={rankingType}
          onRankingTypeChange={changeRankingType}
          gender={gender}
          onGenderChange={changeGender}
          regions={regions}
          regionSelection={regionSelection}
          onRegionChange={changeRegion}
          onEventPickerTrigger={(trigger) => { railEventPickerTriggerRef.current = trigger; }}
          compactResultType={topRailProgress >= 1 || Boolean(rankingSource) && isMobileControls}
          showResultType={!(eventId === "SOR" || eventId === "sor-kinch" || (subject === "competitions" && (competitionRanking === "podiums" || competitionRanking === "latitude" || competitionRanking === "competitor-count")))}
          showEventPicker={!(subject === "competitions" && (competitionRanking === "latitude" || competitionRanking === "competitor-count"))}
          showRegion
          showGender={subject === "people" || subject === "results"}
          showSearch
          hemisphere={subject === "competitions" && competitionRanking === "latitude" ? latitudeHemisphere : undefined}
          onHemisphereChange={(nextHemisphere) => {
            setLatitudeHemisphere(nextHemisphere);
            setStartRank(1);
            updateQueryParams({
              hemisphere: nextHemisphere === "south" ? "south" : null,
            });
          }}
          listAddAction={listOwner ? () => setListAddOpen(true) : undefined}
          regionDisabled={regionSelectionDisabled}
          searchInputRef={setRailFindInputRef}
          findOpen={findOpen}
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
        />}
      </div>

      <main>
        <div className="outerListWrapper" ref={listRef}>
          <div className="listContainer">
            {listNotice && <div className="listMessage">{listNotice}</div>}
            {listMembershipRequests && <ListMembershipRequestRows listId={listMembershipRequests.listId} initialRequests={listMembershipRequests.requests} />}
            {loadingPrevious && (
              <div className="listMessage">Loading earlier rankings…</div>
            )}
            {error ? (
              <div className="listMessage">{error}</div>
            ) : mockSubjectRows ? (
              <SubjectMockRows
                subject={subject}
                competitionRanking={competitionRanking}
                latitudeHemisphere={latitudeHemisphere}
              />
            ) : (
              <ResultsTable
                listRef={rankingListRef}
                entries={entries}
                renderedRows={renderedRows}
                renderedListHeight={renderedListHeight}
                listOffset={listOffset}
                eventId={eventId}
                rankingType={entriesRankingType}
                hideIdentityIds={subject === "competitions"}
                loading={loading}
                showLoading={showLoading}
                preserveListDuringLoad={preserveListDuringLoad}
                hasMore={hasMore}
                loadingMore={loadingMore}
                searchMatchPersonIds={searchMatchPersonIds}
                highlightedPersonId={highlightedPersonId}
                measureElement={rowVirtualizer.measureElement}
                onRowNavigate={handleRowNavigate}
                memberSelectionMode={memberSelectionMode}
                selectedMemberIds={selectedMemberIds}
                onMemberToggle={(personId) => setSelectedMemberIds((current) => { const next = new Set(current); next.has(personId) ? next.delete(personId) : next.add(personId); return next; })}
                onMemberContextMenu={listOwner ? (entry, position) => {
                  setMemberContextMenu({
                    personId: entry.personId,
                    x: Math.max(8, Math.min(position.x, window.innerWidth - 176)),
                    y: Math.max(8, Math.min(position.y, window.innerHeight - 56)),
                  });
                } : undefined}
              />
            )}
          </div>
        </div>

        {!memberSelectionMode && (!rankingSource || total > PAGE_SIZE) && <JumpControlsVisibility
          progress={pagerNavigationBusy ? 1 : bottomRailProgress}
        >
          <RankingsPagerRail
            upArmed={false}
            downArmed={false}
            busy={pagerNavigationBusy}
            currentPosition={visibleSubRank}
            total={total}
            onJumpUp={handleJumpUp}
            onJumpDown={handleJumpDown}
            onFocusMe={subject === "people" && showMyRank ? focusMyRanking : undefined}
            searchActive={findOpen && findMatches.length > 0}
            onSearchPrevious={() => cycleFind(-1)}
            onSearchNext={() => cycleFind(1)}
          />
        </JumpControlsVisibility>}
      </main>
      {memberSelectionMode && <div className="listMemberSelectionRail"><button type="button" onClick={() => setMemberSelectionMode(false)}>Cancel</button><span>{selectedMemberIds.size} selected</span><button type="button" disabled={!selectedMemberIds.size} onClick={() => { setMemberRemovalError(""); setMemberRemovalPersonIds([...selectedMemberIds]); setMemberRemovalOpen(true); }}>Remove</button></div>}
      {memberContextMenu && <><div className="listMemberContextMenuBackdrop" onPointerDown={() => setMemberContextMenu(null)} /><div className="listMemberContextMenu" role="menu" style={{ left: memberContextMenu.x, top: memberContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><button type="button" role="menuitem" onClick={() => { setMemberContextMenu(null); setMemberRemovalError(""); setMemberRemovalPersonIds([memberContextMenu.personId]); setMemberRemovalOpen(true); }}>Remove</button></div></>}
      {memberRemovalOpen && <div className="listModalBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !memberRemovalBusy) setMemberRemovalOpen(false); }}><section className="listModal listRemovalDialog" role="dialog" aria-modal="true" aria-label="Remove people"><h2>Remove people?</h2><p>Remove {memberRemovalPersonIds.length} {memberRemovalPersonIds.length === 1 ? "person" : "people"} from this list?</p>{memberRemovalError && <p className="listModalError" role="alert">{memberRemovalError}</p>}<div className="listRemovalActions"><button type="button" disabled={memberRemovalBusy} onClick={() => setMemberRemovalOpen(false)}>Cancel</button><button type="button" disabled={memberRemovalBusy} onClick={() => void removeSelectedMembers()}>{memberRemovalBusy ? "Removing…" : "Remove"}</button></div></section></div>}
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
          {formatRankingsFreshness(exportDate)}
        </span>
        {process.env.NODE_ENV !== "production" && (
          <span className="debugScrollY">scrollY: {Math.round(debugScrollY)}</span>
        )}
      </footer>
    </div>
  );
}
