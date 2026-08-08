"use client";

import type { ReactNode } from "react";
import { VimHelp } from "../VimHelp/VimHelp";
import { VimSearchInput } from "../VimSearchInput/VimSearchInput";
import { useRankingsExplorer } from "./RankingsExplorerContext";

export function RankingsAppShell({
  children,
}: {
  children: ReactNode;
}) {
  const { search, vim } = useRankingsExplorer();
  const { mode } = vim.state;
  const { query, regexSearch } = search.state;

  return (
    <div
      className={`app${mode || regexSearch ? " app--vimMode" : ""}${
        query.trim() ? " app--searching" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function VimNavigationOverlay() {
  const { search, vim } = useRankingsExplorer();
  const { mode, command, helpOpen } = vim.state;
  const { query, regexSearch, loading, pending, activeMatch, matches, index } =
    search.state;

  if (!mode && !regexSearch) return null;

  return (
    <>
      <VimSearchInput
        state={{
          inputRef: vim.inputRef,
          mode,
          command,
          helpOpen,
        }}
        search={{
          active: regexSearch,
          query,
          loading,
          pending,
          activeMatch,
          matches,
          index,
        }}
        actions={{
          changeCommand: vim.actions.setCommand,
          closeSearch: () => search.actions.setOpen(false),
          cycleSearch: search.actions.cycle,
          toggleHelp: () => vim.actions.setHelpOpen((open) => !open),
        }}
      />
      {helpOpen && <VimHelp onClose={() => vim.actions.setHelpOpen(false)} />}
    </>
  );
}
