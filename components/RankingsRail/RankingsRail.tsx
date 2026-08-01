"use client";

import { forwardRef, useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EventPicker, type EventPickerOption } from "../EventPicker/EventPicker";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import CompassIcon from "../Icon/compass.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import { type RankingEntry, type RegionOption, type RegionSelection } from "../RankingsExplorer/types";
import type { GenderFilter } from "@/lib/wca";
import { GenderPicker } from "../GenderPicker/GenderPicker";
import { useWcaProfile } from "../Auth/useWcaProfile";

export const RankingsRail = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; direction: "up" | "down"; searchNavigation?: boolean; compactResultType?: boolean }>(
  ({ children, className = "", direction, searchNavigation, compactResultType }, ref) => (
    <div ref={ref} className={`Jump RankingsRail ${className}`} data-direction={direction} data-search-navigation={searchNavigation || undefined} data-compact-result-type={compactResultType || undefined}>
      {children}
    </div>
  )
);

RankingsRail.displayName = "RankingsRail";

export type RankingsRailSearch = {
  searchInputRef?: (input: HTMLInputElement | null) => void;
  findOpen: boolean;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatches: RankingEntry[];
  findIndex: number;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchCycle: (direction: -1 | 1) => void;
};

function RailSearch({ model }: { model: RankingsRailSearch }) {
  const {
    searchInputRef,
    findOpen,
    findQuery,
    findError,
    findLoading,
    findPending,
    findMatches,
    findIndex,
    onSearchOpen,
    onSearchClose,
    onSearchQueryChange,
    onSearchCycle,
  } = model;
  const inputRef = useRef<HTMLInputElement>(null);

  const setInputElement = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input;
    searchInputRef?.(input);
  }, [searchInputRef]);

  let status = findError;
  if (!status && findQuery.trim()) {
    status = findMatches.length
      ? `${findIndex + 1} of ${findMatches.length}`
      : "No matches";
  }
  const openSearch = () => {
    onSearchOpen();
    inputRef.current?.focus();
    window.setTimeout(() => inputRef.current?.focus(), 25);
  };

  return (
    <div
      className="findBar findBar--rail"
      data-open={findOpen}
      data-has-text={findQuery.length > 0}
      role="search"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (findQuery) onSearchQueryChange("");
        inputRef.current?.blur();
        onSearchClose();
      }}
    >
      <button className="findIcon" type="button" onMouseDown={(event) => event.preventDefault()} onClick={openSearch} aria-label="Search names or WCA IDs" title="Search names or WCA IDs (Ctrl+F)"><SearchIcon /></button>
      <input ref={setInputElement} className="findInput" type="text" tabIndex={findOpen || findQuery ? 0 : -1} value={findQuery} onChange={(event) => onSearchQueryChange(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); onSearchCycle(event.shiftKey ? -1 : 1); } }} aria-label="Find a name or WCA ID" />
      <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">{findLoading || findPending ? <span className="searchSpinner" aria-label="Searching" /> : status}</span>
      <button className="findClose" type="button" tabIndex={findOpen || findQuery ? 0 : -1} onMouseDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.blur(); onSearchClose(); }} aria-label="Close search"><CloseIcon /></button>
    </div>
  );
}

export type RankingsControlsModel<T extends EventPickerOption> = {
  event: T;
  eventOptions?: readonly T[];
  additionalEventOptions?: readonly T[];
  onEventChange: (eventId: T["id"]) => void;
  rankingType: "single" | "average";
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  gender: readonly GenderFilter[];
  onGenderChange: (gender: GenderFilter[]) => void;
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onRegionChange: (region: RegionOption) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
  compactResultType?: boolean;
  showResultType?: boolean;
  showEventPicker?: boolean;
  showGender?: boolean;
  hemisphere?: "north" | "south";
  onHemisphereChange?: (hemisphere: "north" | "south") => void;
  listAddAction?: () => void;
  regionDisabled?: boolean;
};

export function RankingsControlsRail<T extends EventPickerOption>({
  controls,
  search,
}: {
  controls: RankingsControlsModel<T>;
  search?: RankingsRailSearch;
}) {
  const {
    event,
    eventOptions,
    additionalEventOptions,
    onEventChange,
    rankingType,
    onRankingTypeChange,
    gender,
    onGenderChange,
    regions,
    regionSelection,
    onRegionChange,
    onEventPickerTrigger,
    compactResultType = false,
    showResultType = true,
    showEventPicker = true,
    showGender = true,
    hemisphere,
    onHemisphereChange,
    listAddAction,
    regionDisabled = false,
  } = controls;
  const nextType = rankingType === "single" ? "average" : "single";
  let primaryControl = null;
  if (showEventPicker) {
    primaryControl = (
      <EventPicker
        event={event}
        options={eventOptions}
        additionalOptions={additionalEventOptions}
        onChange={onEventChange}
        onTriggerReady={onEventPickerTrigger}
      />
    );
  } else if (hemisphere) {
    const nextHemisphere = hemisphere === "north" ? "south" : "north";
    primaryControl = (
      <button
        className="Jump-latitudeToggle"
        type="button"
        data-hemisphere={hemisphere}
        aria-label={`Latitude: ${hemisphere} first. Switch to ${nextHemisphere} first`}
        title={`Latitude: ${hemisphere} first`}
        onClick={() => onHemisphereChange?.(nextHemisphere)}
      >
        <CompassIcon />
        <span>{hemisphere === "north" ? "North" : "South"}</span>
      </button>
    );
  }
  return (
    <RankingsRail className={`Jump--rankings${showResultType ? "" : " Jump--withoutResultType"}${hemisphere ? " Jump--withHemisphere" : ""}${listAddAction ? " Jump--withListAdd" : ""}`} direction="up" compactResultType={compactResultType}>
      <div className="Jump-railSettings">
        {primaryControl}
        {showResultType && <div className="Jump-resultTypeControl">
          <button className="Jump-resultTypeToggle" type="button" disabled={event.id === "333mbf"} aria-label={`Switch to ${nextType} rankings`} onClick={() => onRankingTypeChange(nextType)}>{rankingType === "single" ? "Single" : "Average"}</button>
        </div>}
        {showGender && <GenderPicker className="Jump-genderPicker" value={gender} onChange={onGenderChange} />}
        <RegionPicker className="Jump-regionPicker" options={regions} selected={regionSelection} onChange={onRegionChange} disabled={regionDisabled} />
        {listAddAction && <button className="Jump-listAddButton" type="button" onClick={listAddAction}>+ Add</button>}
      </div>
      {search && <RailSearch model={search} />}
    </RankingsRail>
  );
}

export type RankingsPagerNavigation = {
  busy?: boolean;
  currentPosition: number;
  total: number;
  onJumpUp: () => void;
  onJumpDown: () => void;
  onFocusMe?: (wcaId: string) => void;
};

export type RankingsPagerSearch = {
  active: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export function RankingsPagerRail({
  navigation,
  search,
}: {
  navigation: RankingsPagerNavigation;
  search: RankingsPagerSearch;
}) {
  const {
    busy = false,
    currentPosition,
    total,
    onJumpUp,
    onJumpDown,
    onFocusMe,
  } = navigation;
  const {
    active: searchActive,
    onPrevious: onSearchPrevious,
    onNext: onSearchNext,
  } = search;
  const wcaId = useWcaProfile(Boolean(onFocusMe)).data?.profile?.wcaId ?? null;
  const currentLabels = {
    up: currentPosition <= 5000 ? "Top" : "-5000",
    down:
      Number.isFinite(total) && currentPosition >= total - 5000
        ? "End"
        : "+5000",
  };
  const [wasBusy, setWasBusy] = useState(busy);
  const [busyLabels, setBusyLabels] = useState(currentLabels);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (busy) setBusyLabels(currentLabels);
  }
  const labels = busy ? busyLabels : currentLabels;
  return <RankingsRail className="Jump--pager" direction="down" searchNavigation={searchActive}>
    <div className="Jump-pagerActions" aria-hidden={searchActive}>
      <button className="Jump-pagerButton" onClick={onJumpUp} type="button" disabled={searchActive || busy}><ArrowUpIcon /><span>{labels.up}</span></button>
      {wcaId && onFocusMe && <button className="Jump-pagerButton Jump-pagerButton--me" onClick={() => onFocusMe(wcaId)} type="button" disabled={searchActive || busy} aria-label="Jump to my ranking"><span>My rank</span></button>}
      <button className="Jump-pagerButton" onClick={onJumpDown} type="button" disabled={searchActive || busy}><span>{labels.down}</span><ArrowDownIcon /></button>
    </div>
    <div className="Jump-searchNavigation" aria-hidden={!searchActive}><div className="Jump-searchNavigationContent">
      <button className="Jump-searchNavigationButton" onClick={onSearchPrevious} type="button" disabled={!searchActive}><ArrowUpIcon /><span>Previous person</span></button>
      <button className="Jump-searchNavigationButton" onClick={onSearchNext} type="button" disabled={!searchActive}><span>Next person</span><ArrowDownIcon /></button>
    </div></div>
  </RankingsRail>;
}

export function ListBrowseControlsRail({ query, onQueryChange }: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <RankingsRail className="Jump--listBrowse" direction="up">
      <div className="findBar findBar--rail" data-open="true" role="search">
        <span className="listBrowseSearchIcon" aria-hidden="true"><SearchIcon /></span>
        <input className="findInput" value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label="Filter public lists" placeholder="Search public lists" autoFocus />
      </div>
    </RankingsRail>
  );
}

export function ListBrowsePagerRail({ onJumpUp, onJumpDown }: {
  onJumpUp: () => void;
  onJumpDown: () => void;
}) {
  return (
    <RankingsRail className="Jump--pager" direction="down">
      <div className="Jump-pagerActions">
        <button className="Jump-pagerButton" onClick={onJumpUp} type="button"><span>Jump to top</span><ArrowUpIcon /></button>
        <button className="Jump-pagerButton" onClick={onJumpDown} type="button"><ArrowDownIcon /><span>Jump to end</span></button>
      </div>
    </RankingsRail>
  );
}
