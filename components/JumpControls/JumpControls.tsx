"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EventPicker } from "../EventPicker/EventPicker";
import { RegionPicker } from "../RegionPicker/RegionPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import {
  formatRankingNumber,
  type RankingEntry,
  type RegionOption,
  type RegionSelection,
} from "../RankingsExplorer/types";
import { WCA_EVENTS } from "@/lib/wca";

export const JumpRail = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    className?: string;
    direction: "up" | "down";
    searchNavigation?: boolean;
  }
>(({ children, className = "", direction, searchNavigation }, ref) => (
  <div
    ref={ref}
    className={`Jump JumpRail ${className}`}
    data-direction={direction}
    data-search-navigation={searchNavigation || undefined}
  >
    {children}
  </div>
));

JumpRail.displayName = "JumpRail";

function RailSearch({
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
}: {
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
    searchStatus = findMatches.length
      ? `${findIndex + 1} of ${findMatches.length}`
      : "No matches";
  }

  const openSearch = () => {
    onSearchOpen();
    inputRef.current?.focus();
    setTimeout(() => inputRef.current?.focus(), 25);
  };

  return (
    <div
      ref={searchBarRef}
      className="findBar findBar--rail"
      data-open={findOpen}
      data-has-text={findQuery.length > 0}
      role="search"
    >
      <button
        className="findIcon"
        type="button"
        onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
        onClick={openSearch}
        aria-label="Search names or WCA IDs"
        title="Search names or WCA IDs (Ctrl+F)"
      >
        <SearchIcon />
      </button>
      <input
        ref={inputRef}
        className="findInput"
        type="text"
        tabIndex={findOpen || findQuery ? 0 : -1}
        value={findQuery}
        onChange={(inputEvent) => onSearchQueryChange(inputEvent.target.value)}
        onKeyDown={(keyboardEvent: KeyboardEvent<HTMLInputElement>) => {
          if (keyboardEvent.key !== "Enter") return;
          keyboardEvent.preventDefault();
          onSearchCycle(keyboardEvent.shiftKey ? -1 : 1);
        }}
        aria-label="Find a name or WCA ID"
      />
      <span className={`findStatus${findError ? " isError" : ""}`} aria-live="polite">
        {searching ? <span className="searchSpinner" aria-label="Searching" /> : searchStatus}
      </span>
      <button
        className="findClose"
        type="button"
        tabIndex={findOpen || findQuery ? 0 : -1}
        onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
        onClick={() => {
          inputRef.current?.blur();
          onSearchClose();
        }}
        aria-label="Close search"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function RankingsJumpRail({
  event,
  onEventChange,
  rankingType,
  onRankingTypeChange,
  regions,
  regionSelection,
  onRegionChange,
  onEventPickerTrigger,
  ...searchProps
}: {
  event: (typeof WCA_EVENTS)[number];
  onEventChange: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  rankingType: "single" | "average";
  onRankingTypeChange: (rankingType: "single" | "average") => void;
  regions: RegionOption[];
  regionSelection: RegionSelection;
  onRegionChange: (region: RegionOption) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
} & Parameters<typeof RailSearch>[0]) {
  const nextRankingType = rankingType === "single" ? "average" : "single";

  return (
    <JumpRail className="Jump--rankings" direction="up">
      <div className="Jump-railSettings">
        <EventPicker
          event={event}
          onChange={onEventChange}
          onTriggerReady={onEventPickerTrigger}
        />
        <button
          className="Jump-resultTypeToggle"
          type="button"
          disabled={event.id === "333mbf"}
          aria-label={`Switch to ${nextRankingType} rankings`}
          title={
            event.id === "333mbf"
              ? "Multi-Blind has no average"
              : `Switch to ${nextRankingType} rankings`
          }
          onClick={() => onRankingTypeChange(nextRankingType)}
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
      <RailSearch {...searchProps} />
    </JumpRail>
  );
}

export function RankingsPagerRail({
  upArmed,
  downArmed,
  currentPosition,
  total,
  onJumpUp,
  onJumpDown,
  searchActive,
  onSearchPrevious,
  onSearchNext,
}: {
  upArmed: boolean;
  downArmed: boolean;
  currentPosition: number;
  total: number;
  onJumpUp: () => void;
  onJumpDown: () => void;
  searchActive: boolean;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
}) {
  const nearTop = currentPosition <= 5000;
  const nearEnd = Number.isFinite(total) && currentPosition >= total - 5000;
  const upLabel = upArmed || nearTop ? "Jump to top" : `Up ${formatRankingNumber(5000)}`;
  const downLabel = downArmed || nearEnd ? "Jump to end" : `Down ${formatRankingNumber(5000)}`;

  return (
    <JumpRail
      className="Jump--pager"
      direction="down"
      searchNavigation={searchActive}
    >
      <div className="Jump-pagerActions" aria-hidden={searchActive}>
        <button className="Jump-pagerButton" onClick={onJumpUp} type="button" disabled={searchActive}>
          <ArrowUpIcon />
          <span>{upLabel}</span>
        </button>
        <button className="Jump-pagerButton" onClick={onJumpDown} type="button" disabled={searchActive}>
          <ArrowDownIcon />
          <span>{downLabel}</span>
        </button>
      </div>
      <div className="Jump-searchNavigation" aria-hidden={!searchActive}>
        <div className="Jump-searchNavigationContent">
          <button className="Jump-searchNavigationButton" onClick={onSearchPrevious} type="button" disabled={!searchActive}>
            <ArrowUpIcon />
            <span>Previous person</span>
          </button>
          <button className="Jump-searchNavigationButton" onClick={onSearchNext} type="button" disabled={!searchActive}>
            <span>Next person</span>
            <ArrowDownIcon />
          </button>
        </div>
      </div>
    </JumpRail>
  );
}
