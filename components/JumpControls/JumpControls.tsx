"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EventPicker } from "../EventPicker/EventPicker";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import SettingsIcon from "../Icon/settings.svg?react";
import {
  formatRankingNumber,
  type RegionOption,
  type RegionSelection,
} from "../RankingsExplorer/types";
import { WCA_EVENTS } from "@/lib/wca";

type RailSearchProps = {
  searchInputRef?: (input: HTMLInputElement | null) => void;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatchCount: number;
  findIndex?: number;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchCycle?: (direction: -1 | 1) => void;
};

type JumpActionProps = {
  armed: boolean;
  currentPosition: number;
  onJump: () => void;
  jumpLabel?: string;
};

export const JumpRail = forwardRef<HTMLDivElement, {
  children: ReactNode;
  className?: string;
  expanded?: boolean;
}>(({ children, className = "", expanded = false }, ref) => (
  <div
    ref={ref}
    className={`Jump JumpRail ${className}`}
    data-direction="up"
    data-expanded={expanded}
  >
    {children}
  </div>
));

JumpRail.displayName = "JumpRail";

function RailSearch({
  searchInputRef,
  findQuery,
  findError,
  findLoading,
  findPending,
  findMatchCount,
  findIndex,
  onSearchOpen,
  onSearchClose,
  onSearchQueryChange,
  onSearchCycle,
}: RailSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (keyboardEvent: globalThis.KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;

      const searchHasFocus = searchBarRef.current?.contains(document.activeElement);
      if (!findQuery && !searchHasFocus) return;

      keyboardEvent.preventDefault();
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

  const searching = findLoading || findPending;
  let searchStatus = "";
  if (findError) searchStatus = findError;
  else if (findQuery.trim()) {
    searchStatus = findMatchCount
      ? findIndex === undefined
        ? `${findMatchCount} matches`
        : `${findIndex + 1} of ${findMatchCount}`
      : "No matches";
  }

  const handleSearchKeyDown = (keyboardEvent: KeyboardEvent<HTMLInputElement>) => {
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      onSearchCycle?.(keyboardEvent.shiftKey ? -1 : 1);
    }
  };

  const openSearch = () => {
    onSearchOpen();
    inputRef.current?.focus();
    setTimeout(() => inputRef.current?.focus(), 25);
  };

  return (
    <div
      ref={searchBarRef}
      className="findBar findBar--rail"
      data-has-text={findQuery.length > 0}
      role="search"
    >
      <button className="findIcon" type="button" tabIndex={-1}
        onMouseDown={(mouseEvent) => mouseEvent.preventDefault()} onClick={openSearch}
        aria-label="Search names or WCA IDs" title="Search names or WCA IDs (Ctrl+F)">
        <SearchIcon />
      </button>
      <input ref={inputRef} className="findInput" type="text" value={findQuery}
        onFocus={onSearchOpen} onChange={(inputEvent) => onSearchQueryChange(inputEvent.target.value)}
        onKeyDown={handleSearchKeyDown} aria-label="Find a name or WCA ID" />
      <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">
        {searching ? <span className="searchSpinner" aria-label="Searching" /> : searchStatus}
      </span>
      <button className="findClose" type="button" onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
        onClick={() => { inputRef.current?.blur(); onSearchClose(); }} aria-label="Close search">
        <CloseIcon />
      </button>
    </div>
  );
}

function JumpAction({ armed, currentPosition, onJump, jumpLabel }: JumpActionProps) {
  const label = jumpLabel ?? (armed || currentPosition <= 5000
    ? "Jump to top"
    : `Jump ${formatRankingNumber(5000)}`);

  return <div className="Jump-buttonWrapper"><div className="Jump-buttonClip">
    <button className="Jump-button" onClick={onJump} type="button">
      <ArrowUpIcon /><span>{label}</span><ArrowUpIcon />
    </button>
  </div></div>;
}

type SharedRailProps = JumpActionProps & RailSearchProps;

export function RankingsJumpRail({
  armed,
  currentPosition,
  onJump,
  jumpLabel,
  event,
  onEventChange,
  rankingType,
  onRankingTypeChange,
  regions,
  regionSelection,
  onRegionChange,
  onEventPickerTrigger,
  searchInputRef,
  findQuery,
  findError,
  findLoading,
  findPending,
  findMatchCount,
  findIndex,
  onSearchOpen,
  onSearchClose,
  onSearchQueryChange,
  onSearchCycle,
}: SharedRailProps & {
  event?: (typeof WCA_EVENTS)[number];
  onEventChange?: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  rankingType?: "single" | "average";
  onRankingTypeChange?: (rankingType: "single" | "average") => void;
  regions?: RegionOption[];
  regionSelection?: RegionSelection;
  onRegionChange?: (region: RegionOption) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
}) {
  return (
    <JumpRail className="Jump--rankings" expanded>
      {event && onEventChange && <EventPicker
        event={event}
        onChange={onEventChange}
        onTriggerReady={onEventPickerTrigger}
      />}
      <JumpAction armed={armed} currentPosition={currentPosition} onJump={onJump} jumpLabel={jumpLabel} />
      <RailSearch {...{ searchInputRef, findQuery, findError, findLoading, findPending, findMatchCount, findIndex, onSearchOpen, onSearchClose, onSearchQueryChange, onSearchCycle }} />
      {event && rankingType && onRankingTypeChange && regions && regionSelection && onRegionChange && (
      <div className="Jump-secondaryControls">
        <button
          className="Jump-resultTypeToggle"
          type="button"
          disabled={event.id === "333mbf"}
          aria-label={`Switch to ${rankingType === "single" ? "average" : "single"} rankings`}
          title={
            event.id === "333mbf"
              ? "Multi-Blind has no average"
              : `Switch to ${rankingType === "single" ? "average" : "single"} rankings`
          }
          onClick={() =>
            onRankingTypeChange(rankingType === "single" ? "average" : "single")
          }
        >
          {rankingType === "single" ? "Single" : "Average"}
        </button>
        <RegionPicker
          className="Jump-regionPicker"
          options={regions}
          selected={regionSelection}
          onChange={onRegionChange}
        />
      </div>
      )}
    </JumpRail>
  );
}

export function MatrixJumpRail({
  rankingType,
  onRankingTypeChange,
  regions,
  regionSelection,
  onRegionChange,
  ...railProps
}: SharedRailProps & {
  rankingType: "single" | "average";
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onRegionChange: (region: RegionOption) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);

  return (
    <JumpRail ref={railRef} className="Jump--matrix" expanded={expanded}>
      <button className="Jump-settingsButton" type="button" aria-label="Ranking settings"
        aria-expanded={expanded} onClick={() => setExpanded((isExpanded) => !isExpanded)}>
        <SettingsIcon />
      </button>
      <JumpAction {...railProps} />
      <RailSearch {...railProps} />
      <div className="Jump-secondaryControls" aria-hidden={!expanded}>
        <div className="Jump-resultTypeSelect" aria-label="Result type">
          <button type="button" aria-pressed={rankingType === "single"}
            onClick={() => onRankingTypeChange("single")}>Single</button>
          <button type="button" aria-pressed={rankingType === "average"}
            onClick={() => onRankingTypeChange("average")}>Average</button>
        </div>
        <RegionPicker className="Jump-regionPicker" options={regions}
          selected={regionSelection} onChange={onRegionChange} />
      </div>
    </JumpRail>
  );
}

export function JumpDownControls({
  armed,
  currentPosition,
  total,
  onJump,
  jumpLabel,
  searchActive,
  onSearchPrevious,
  onSearchNext,
}: {
  armed: boolean;
  currentPosition: number;
  total: number;
  onJump: () => void;
  jumpLabel?: string;
  searchActive: boolean;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
}) {
  const nearEnd = Number.isFinite(total) && currentPosition >= total - 5000;
  const label = jumpLabel ?? (
    armed || nearEnd ? "Jump to end" : `Jump ${formatRankingNumber(5000)}`
  );

  return (
    <div
      className="Jump"
      data-direction="down"
      data-search-navigation={searchActive}
    >
      <div className="Jump-buttonWrapper">
        <div className="Jump-buttonClip">
          <button
            className="Jump-button"
            onClick={onJump}
            type="button"
            disabled={searchActive}
            aria-hidden={searchActive}
          >
            <ArrowDownIcon />
            <span>{label}</span>
            <ArrowDownIcon />
          </button>
        </div>
      </div>
      <div
        className="Jump-searchNavigation"
        aria-hidden={!searchActive}
      >
        <div className="Jump-searchNavigationContent">
          <button
            className="Jump-searchNavigationButton"
            onClick={onSearchPrevious}
            type="button"
            disabled={!searchActive}
          >
            <ArrowUpIcon />
            <span>Previous person</span>
          </button>
          <button
            className="Jump-searchNavigationButton"
            onClick={onSearchNext}
            type="button"
            disabled={!searchActive}
          >
            <span>Next person</span>
            <ArrowDownIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
