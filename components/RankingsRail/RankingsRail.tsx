"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EventPicker, type EventPickerOption } from "../EventPicker/EventPicker";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import CompassIcon from "../Icon/compass.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import { formatRankingNumber, type RankingEntry, type RegionOption, type RegionSelection } from "../RankingsExplorer/types";
import type { GenderFilter } from "@/lib/wca";
import { GenderPicker } from "../GenderPicker/GenderPicker";

type AuthProfileResponse = {
  profile: { wcaId: string } | null;
};

export const RankingsRail = forwardRef<HTMLDivElement, { children: ReactNode; className?: string; direction: "up" | "down"; searchNavigation?: boolean; compactResultType?: boolean }>(
  ({ children, className = "", direction, searchNavigation, compactResultType }, ref) => (
    <div ref={ref} className={`Jump RankingsRail ${className}`} data-direction={direction} data-search-navigation={searchNavigation || undefined} data-compact-result-type={compactResultType || undefined}>
      {children}
    </div>
  )
);

RankingsRail.displayName = "RankingsRail";

function RailSearch({ searchInputRef, findOpen, findQuery, findError, findLoading, findPending, findMatches, findIndex, onSearchOpen, onSearchClose, onSearchQueryChange, onSearchCycle }: {
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
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);
  const focusAfterOpenRef = useRef(false);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const hasFocus = searchBarRef.current?.contains(document.activeElement);
      if (!findQuery && !hasFocus) return;
      event.preventDefault();
      if (findQuery) onSearchQueryChange("");
      inputRef.current?.blur();
      onSearchClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [findQuery, onSearchClose, onSearchQueryChange]);

  useEffect(() => {
    searchInputRef?.(inputRef.current);
    return () => searchInputRef?.(null);
  }, [searchInputRef]);

  useEffect(() => {
    if (!findOpen || !focusAfterOpenRef.current) return;
    focusAfterOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [findOpen]);

  const status = findError || (findQuery.trim() ? findMatches.length ? `${findIndex + 1} of ${findMatches.length}` : "No matches" : "");
  const openSearch = () => {
    focusAfterOpenRef.current = true;
    onSearchOpen();
  };

  return (
    <div ref={searchBarRef} className="findBar findBar--rail" data-open={findOpen} data-has-text={findQuery.length > 0} role="search">
      <button className="findIcon" type="button" onMouseDown={(event) => event.preventDefault()} onClick={openSearch} aria-label="Search names or WCA IDs" title="Search names or WCA IDs (Ctrl+F)"><SearchIcon /></button>
      <input ref={inputRef} className="findInput" type="text" tabIndex={findOpen || findQuery ? 0 : -1} value={findQuery} onChange={(event) => onSearchQueryChange(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); onSearchCycle(event.shiftKey ? -1 : 1); } }} aria-label="Find a name or WCA ID" />
      <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">{findLoading || findPending ? <span className="searchSpinner" aria-label="Searching" /> : status}</span>
      <button className="findClose" type="button" tabIndex={findOpen || findQuery ? 0 : -1} onMouseDown={(event) => event.preventDefault()} onClick={() => { inputRef.current?.blur(); onSearchClose(); }} aria-label="Close search"><CloseIcon /></button>
    </div>
  );
}

export function RankingsControlsRail<T extends EventPickerOption>({ event, eventOptions, additionalEventOptions, onEventChange, rankingType, onRankingTypeChange, gender, onGenderChange, regions, regionSelection, onRegionChange, onEventPickerTrigger, compactResultType = false, showResultType = true, showEventPicker = true, showRegion = true, showGender = true, showSearch = true, hemisphere, onHemisphereChange, ...searchProps }: {
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
  showRegion?: boolean;
  showGender?: boolean;
  showSearch?: boolean;
  hemisphere?: "north" | "south";
  onHemisphereChange?: (hemisphere: "north" | "south") => void;
} & Parameters<typeof RailSearch>[0]) {
  const nextType = rankingType === "single" ? "average" : "single";
  return (
    <RankingsRail className={`Jump--rankings${showResultType ? "" : " Jump--withoutResultType"}${hemisphere ? " Jump--withHemisphere" : ""}`} direction="up" compactResultType={compactResultType}>
      <div className="Jump-railSettings">
        {showEventPicker ? (
          <EventPicker event={event} options={eventOptions} additionalOptions={additionalEventOptions} onChange={onEventChange} onTriggerReady={onEventPickerTrigger} />
        ) : hemisphere ? (
          <button className="Jump-latitudeToggle" type="button" data-hemisphere={hemisphere} aria-label={`Latitude: ${hemisphere} first. Switch to ${hemisphere === "north" ? "south" : "north"} first`} title={`Latitude: ${hemisphere} first`} onClick={() => onHemisphereChange?.(hemisphere === "north" ? "south" : "north")}>
            <CompassIcon />
            <span>{hemisphere === "north" ? "North" : "South"}</span>
          </button>
        ) : null}
        {showResultType && <div className="Jump-resultTypeControl">
          <button className="Jump-resultTypeToggle" type="button" aria-label={`Switch to ${nextType} rankings`} disabled={event.id === "333mbf"} onClick={() => onRankingTypeChange(nextType)}>{rankingType === "single" ? "Single" : "Average"}</button>
        </div>}
        {showGender && <GenderPicker className="Jump-genderPicker" value={gender} onChange={onGenderChange} />}
        {showRegion && <RegionPicker className="Jump-regionPicker" options={regions} selected={regionSelection} onChange={onRegionChange} />}
      </div>
      {showSearch && <RailSearch {...searchProps} />}
    </RankingsRail>
  );
}

export function RankingsPagerRail({ upArmed, downArmed, currentPosition, total, onJumpUp, onJumpDown, onFocusMe, searchActive, onSearchPrevious, onSearchNext }: {
  upArmed: boolean; downArmed: boolean; currentPosition: number; total: number; onJumpUp: () => void; onJumpDown: () => void; onFocusMe?: (wcaId: string) => void; searchActive: boolean; onSearchPrevious: () => void; onSearchNext: () => void;
}) {
  const [wcaId, setWcaId] = useState<string | null>(null);

  useEffect(() => {
    if (!onFocusMe) return;
    const controller = new AbortController();
    fetch("/api/auth/wca/me", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load profile");
        const { profile } = await response.json() as AuthProfileResponse;
        setWcaId(profile?.wcaId ?? null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWcaId(null);
      });
    return () => controller.abort();
  }, [onFocusMe]);

  const nearTop = currentPosition <= 5000;
  const nearEnd = Number.isFinite(total) && currentPosition >= total - 5000;
  return <RankingsRail className="Jump--pager" direction="down" searchNavigation={searchActive}>
    <div className="Jump-pagerActions" aria-hidden={searchActive}>
      <button className="Jump-pagerButton" onClick={onJumpUp} type="button" disabled={searchActive}><span>{upArmed || nearTop ? "Jump to top" : `Up ${formatRankingNumber(5000)}`}</span><ArrowUpIcon /></button>
      {wcaId && onFocusMe && <button className="Jump-pagerButton Jump-pagerButton--me" onClick={() => onFocusMe(wcaId)} type="button" disabled={searchActive} aria-label="Jump to my ranking"><span>My rank</span></button>}
      <button className="Jump-pagerButton" onClick={onJumpDown} type="button" disabled={searchActive}><ArrowDownIcon /><span>{downArmed || nearEnd ? "Jump to end" : `Down ${formatRankingNumber(5000)}`}</span></button>
    </div>
    <div className="Jump-searchNavigation" aria-hidden={!searchActive}><div className="Jump-searchNavigationContent">
      <button className="Jump-searchNavigationButton" onClick={onSearchPrevious} type="button" disabled={!searchActive}><ArrowUpIcon /><span>Previous person</span></button>
      <button className="Jump-searchNavigationButton" onClick={onSearchNext} type="button" disabled={!searchActive}><span>Next person</span><ArrowDownIcon /></button>
    </div></div>
  </RankingsRail>;
}
