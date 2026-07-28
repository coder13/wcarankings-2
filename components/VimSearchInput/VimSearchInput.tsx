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
  findTotal,
  findIndex,
  vimHelpOpen,
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
  findTotal?: number;
  findIndex?: number;
  vimHelpOpen: boolean;
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
  let matchStatus = "";
  const total = findTotal ?? findMatches.length;
  if (findLoading || findPending) matchStatus = "Searching…";
  else if (findQuery.trim() && activeFindMatch) {
    matchStatus =
      typeof findIndex === "number"
        ? `${findIndex + 1} of ${total}`
        : `${activeFindMatch.personName} · rank ${formatRankingNumber(activeFindMatch.rank)}`;
  } else if (findQuery.trim()) {
    matchStatus = `${total} ${total === 1 ? "match" : "matches"}`;
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
          aria-label={vimSearchActive && !vimMode ? "Vim regex search" : "Vim command"}
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
