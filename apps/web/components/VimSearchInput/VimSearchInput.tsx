"use client";

import type { KeyboardEvent, RefObject } from "react";
import { formatRankingNumber, type RankingEntry } from "../RankingsExplorer/types";

type VimInputState = {
  inputRef: RefObject<HTMLInputElement | null>;
  mode: boolean;
  command: string;
  helpOpen: boolean;
};

type VimInputSearch = {
  active: boolean;
  query: string;
  loading: boolean;
  pending: boolean;
  activeMatch: RankingEntry | null;
  matches: RankingEntry[];
  index?: number;
};

type VimInputActions = {
  changeCommand: (value: string) => void;
  closeSearch: () => void;
  cycleSearch: (direction: -1 | 1) => void;
  toggleHelp: () => void;
};

export function VimSearchInput({
  state,
  search,
  actions,
}: {
  state: VimInputState;
  search: VimInputSearch;
  actions: VimInputActions;
}) {
  const { inputRef, mode, command, helpOpen } = state;
  const { active, query, loading, pending, activeMatch, matches, index } = search;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      active &&
      !mode &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLocaleLowerCase() === "g"
    ) {
      event.preventDefault();
      event.stopPropagation();
      actions.closeSearch();
      actions.cycleSearch(event.shiftKey ? -1 : 1);
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
  if (loading || pending) matchStatus = "Searching…";
  else if (query.trim() && activeMatch) {
    matchStatus =
      typeof index === "number"
        ? `${index + 1} of ${matches.length}`
        : `${activeMatch.personName} · rank ${formatRankingNumber(activeMatch.rank)}`;
  } else if (query.trim()) {
    matchStatus = `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
  }

  return (
    <div className="vimCommandLine" role="status" aria-label="Vim command">
      <div className="vimCommandText">
        <input
          ref={inputRef}
          className="vimInput"
          type="text"
          value={mode ? command : `/${query}`}
          readOnly={!mode}
          aria-label={active && !mode ? "Vim regex search" : "Vim command"}
          onChange={(event) => {
            if (mode) actions.changeCommand(event.target.value);
          }}
          onFocus={(event) => {
            if (!mode) event.currentTarget.blur();
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {active && (
        <span className="vimMatchStatus" aria-live="polite">
          {matchStatus}
        </span>
      )}
      <button
        className="vimHelpButton"
        type="button"
        aria-label="Show Vim keybindings"
        aria-expanded={helpOpen}
        aria-controls="vim-help-popup"
        onClick={actions.toggleHelp}
      >
        ?
      </button>
    </div>
  );
}
