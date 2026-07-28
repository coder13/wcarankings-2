"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { EventPicker } from "../EventPicker/EventPicker";
import ArrowDownIcon from "../Icon/arrow-down.svg?react";
import ArrowUpIcon from "../Icon/arrow-up.svg?react";
import CloseIcon from "../Icon/close.svg?react";
import SearchIcon from "../Icon/search.svg?react";
import {
  formatRankingNumber,
  type RankingEntry,
} from "../RankingsExplorer/types";
import { WCA_EVENTS } from "@/lib/wca";

export function JumpUpControls({
  armed,
  currentPosition,
  onJump,
  event,
  onEventChange,
  onEventPickerTrigger,
  searchInputRef,
  findQuery,
  findError,
  findLoading,
  findPending,
  findMatches,
  findTotal,
  findIndex,
  onSearchOpen,
  onSearchClose,
  onSearchQueryChange,
  onSearchCycle,
}: {
  armed: boolean;
  currentPosition: number;
  onJump: () => void;
  event: (typeof WCA_EVENTS)[number];
  onEventChange: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  onEventPickerTrigger?: (trigger: HTMLButtonElement | null) => void;
  searchInputRef?: (input: HTMLInputElement | null) => void;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatches: RankingEntry[];
  findTotal?: number;
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

  const label =
    armed || currentPosition <= 5000
      ? "Jump to top"
      : `Jump ${formatRankingNumber(5000)}`;
  const searching = findLoading || findPending;
  const total = findTotal ?? findMatches.length;
  let searchStatus = "";
  if (findError) searchStatus = findError;
  else if (findQuery.trim()) {
    searchStatus = total
      ? `${findIndex + 1} of ${total}`
      : "No matches";
  }

  const handleSearchKeyDown = (keyboardEvent: KeyboardEvent<HTMLInputElement>) => {
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      onSearchCycle(keyboardEvent.shiftKey ? -1 : 1);
    }
  };

  const openSearch = () => {
    onSearchOpen();
    inputRef.current?.focus();
    setTimeout(() => inputRef.current?.focus(), 25);
  };

  return (
    <div className="Jump" data-direction="up">
      <EventPicker
        event={event}
        onChange={onEventChange}
        onTriggerReady={onEventPickerTrigger}
      />
      <div className="Jump-buttonWrapper">
        <div className="Jump-buttonClip">
          <button className="Jump-button" onClick={onJump} type="button">
            <ArrowUpIcon />
            <span>{label}</span>
            <ArrowUpIcon />
          </button>
        </div>
      </div>
      <div
        ref={searchBarRef}
        className="findBar findBar--rail"
        data-has-text={findQuery.length > 0}
        role="search"
      >
          <button
            className="findIcon"
            type="button"
            tabIndex={-1}
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
            value={findQuery}
            onFocus={onSearchOpen}
            onChange={(inputEvent) => onSearchQueryChange(inputEvent.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Find a name or WCA ID"
          />
          <span
            className={`findStatus${findError ? " isError" : ""}`}
            aria-live="polite"
          >
            {searching ? (
              <span className="searchSpinner" aria-label="Searching" />
            ) : (
              searchStatus
            )}
          </span>
          <button
            className="findClose"
            type="button"
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
    </div>
  );
}

export function JumpDownControls({
  armed,
  currentPosition,
  total,
  onJump,
  searchActive,
  onSearchPrevious,
  onSearchNext,
}: {
  armed: boolean;
  currentPosition: number;
  total: number;
  onJump: () => void;
  searchActive: boolean;
  onSearchPrevious: () => void;
  onSearchNext: () => void;
}) {
  const nearEnd = Number.isFinite(total) && currentPosition >= total - 5000;
  const label =
    armed || nearEnd ? "Jump to end" : `Jump ${formatRankingNumber(5000)}`;

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
