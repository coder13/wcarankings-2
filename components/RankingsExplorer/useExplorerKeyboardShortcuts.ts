"use client";

import { useEffect } from "react";
import type { PatchRankingsFilters } from "./useRankingsFilters";
import type { RankingCommands } from "./useRankingCommands";
import type { useRankingsSearch } from "./useRankingsSearch";
import type { useVimNavigation } from "./useVimNavigation";

export function useExplorerKeyboardShortcuts({
  search,
  vim,
  patchFilters,
  commands,
}: {
  search: ReturnType<typeof useRankingsSearch>;
  vim: ReturnType<typeof useVimNavigation>;
  patchFilters: PatchRankingsFilters;
  commands: RankingCommands;
}) {
  const {
    open,
    query,
    regexSearch: regex,
  } = search.state;
  const {
    cycle,
    close,
    reset,
    setOpen,
  } = search.actions;
  const {
    mode,
  } = vim.state;
  const searchActive = search.state.regexSearch;
  const {
    setMode,
    setCommand,
  } = vim.actions;
  const { focusSearch, openEventPicker } = commands;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if ((event.ctrlKey || event.metaKey) && key === "f") {
        event.preventDefault();
        if (mode) {
          setMode(false);
          setCommand(":");
        }
        if (searchActive || regex) reset();
        patchFilters({ regexSearch: false });
        setOpen(true);
        focusSearch();
        return;
      }
      if (mode) return;

      if (
        key === "e" &&
        !isEditable &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        if (!openEventPicker()) return;
        event.preventDefault();
        return;
      }
      if (searchActive && key === "n" && !isEditable) {
        event.preventDefault();
        setOpen(false);
        cycle();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "g") {
        event.preventDefault();
        const direction = event.shiftKey ? -1 : 1;
        if (searchActive) {
          setOpen(false);
          if (query.trim()) cycle(direction);
        } else {
          setOpen(true);
          if (query.trim()) cycle(direction);
          else reset();
        }
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    close,
    cycle,
    focusSearch,
    mode,
    open,
    patchFilters,
    query,
    regex,
    reset,
    searchActive,
    openEventPicker,
    setCommand,
    setMode,
    setOpen,
  ]);
}
