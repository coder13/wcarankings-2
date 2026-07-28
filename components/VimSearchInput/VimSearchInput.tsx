"use client";

import type { KeyboardEvent, RefObject } from "react";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";

export function VimSearchInput({
  inputRef,
  value,
  vimMode,
  vimSearchActive,
  findLoading,
  findPending,
  findQuery,
  activeFindMatch,
  findMatches,
  findMatchCount,
  findIndex,
  vimHelpOpen,
  searchLabel,
  onChange,
  onCycle,
  onToggleHelp,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  vimMode: boolean;
  vimSearchActive: boolean;
  findLoading: boolean;
  findPending: boolean;
  findQuery: string;
  activeFindMatch: RankingEntry | null;
  findMatches: RankingEntry[];
  findMatchCount?: number;
  findIndex?: number;
  vimHelpOpen: boolean;
  searchLabel?: string;
  onChange: (value: string) => void;
  onCycle: (direction: -1 | 1) => void;
  onToggleHelp: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      vimSearchActive &&
      !vimMode &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLocaleLowerCase() === "g"
    ) {
      event.preventDefault();
      event.stopPropagation();
      onCycle(event.shiftKey ? -1 : 1);
      return;
    }
    if (
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      event.stopPropagation();
    }
  };
  const matchCount = findMatchCount ?? findMatches.length;
  let matchStatus = "";
  if (findLoading || findPending) matchStatus = "Searching…";
  else if (findQuery.trim() && activeFindMatch) {
    matchStatus =
      typeof findIndex === "number"
        ? `${findIndex + 1} of ${matchCount}`
        : `${activeFindMatch.personName} · rank ${formatRankingNumber(activeFindMatch.rank)}`;
  } else if (findQuery.trim()) {
    matchStatus = `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
  }

  return (
    <div className="vimCommandLine" role="status" aria-label="Vim command">
      <div className="vimCommandText">
        <input
          ref={inputRef}
          className="vimInput"
          type="text"
          value={value}
          readOnly={!vimMode}
          aria-label={vimSearchActive && !vimMode ? searchLabel ?? "Vim regex search" : "Vim command"}
          onChange={(event) => {
            if (vimMode) onChange(event.target.value);
          }}
          onFocus={(event) => {
            if (!vimMode) event.currentTarget.blur();
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {vimSearchActive && (
        <span className="vimMatchStatus" aria-live="polite">
          {matchStatus}
        </span>
      )}
      <button
        className="vimHelpButton"
        type="button"
        aria-label="Show Vim keybindings"
        aria-expanded={vimHelpOpen}
        aria-controls="vim-help-popup"
        onClick={onToggleHelp}
      >
        ?
      </button>
    </div>
  );
}
