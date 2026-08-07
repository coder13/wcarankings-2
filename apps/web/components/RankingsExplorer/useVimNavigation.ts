"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VimSearchController = {
  active: boolean;
  query: string;
  reset: () => void;
  setOpen: (open: boolean) => void;
  start: (query: string) => void;
};

export function useVimNavigation({
  getCurrentRank,
  goToRank,
  goToEnd,
  jumpSize,
  search,
}: {
  getCurrentRank: () => number;
  goToRank: (rank: number) => void;
  goToEnd: () => void;
  jumpSize: number;
  search: VimSearchController;
}) {
  const {
    active: searchActive,
    query: searchQuery,
    reset: resetSearch,
    setOpen: setSearchOpen,
    start: startSearch,
  } = search;
  const [mode, setMode] = useState(false);
  const [command, setCommand] = useState(":");
  const [helpOpen, setHelpOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cancel = useCallback(() => {
    resetSearch();
    setSearchOpen(false);
    setMode(false);
    setHelpOpen(false);
    setCommand(":");
  }, [resetSearch, setSearchOpen]);

  const execute = useCallback(
    (rawCommand: string) => {
      const commandValue = rawCommand.trim();
      const lowerCommand = commandValue.toLocaleLowerCase();
      const currentRank = getCurrentRank();

      if (
        commandValue === "G" ||
        commandValue === "$" ||
        lowerCommand === "end"
      ) {
        goToEnd();
      } else if (commandValue === "gg" || lowerCommand === "top") {
        goToRank(1);
      } else if (["j", "d", "down", "pagedown"].includes(lowerCommand)) {
        goToRank(currentRank + jumpSize);
      } else if (["k", "u", "up", "pageup"].includes(lowerCommand)) {
        goToRank(currentRank - jumpSize);
      } else if (/^[+-]\d+$/.test(commandValue)) {
        goToRank(currentRank + Number(commandValue));
      } else if (/^\d[\d,]*$/.test(commandValue)) {
        goToRank(Number(commandValue.replaceAll(",", "")));
      }
    },
    [getCurrentRank, goToEnd, goToRank, jumpSize],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable =
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");

      if (event.key === "Escape" && (mode || searchActive)) {
        event.preventDefault();
        cancel();
        return;
      }

      if (!mode) {
        const directCommand = event.key.toLocaleLowerCase();
        if (
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ["j", "k", "d", "u"].includes(directCommand)
        ) {
          event.preventDefault();
          execute(directCommand);
          return;
        }
        if (
          (event.key === ":" || event.key === "/") &&
          !isEditable &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          setMode(true);
          setHelpOpen(false);
          setSearchOpen(false);
          if (event.key === "/" && !searchActive) resetSearch();
          setCommand(
            event.key === "/" && searchActive ? `/${searchQuery}` : event.key,
          );
          window.requestAnimationFrame(() => {
            inputRef.current?.focus();
            const end = inputRef.current?.value.length ?? 0;
            inputRef.current?.setSelectionRange(end, end);
          });
        }
        return;
      }

      const editingSearch = isEditable && command.startsWith("/");
      if (editingSearch && event.key !== "Enter" && event.key !== "Escape")
        return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.key.length !== 1 &&
        !["Enter", "Escape", "Backspace"].includes(event.key)
      )
        return;

      event.preventDefault();
      if (command.startsWith("/")) {
        if (event.key === "Enter") {
          startSearch(command.slice(1));
          inputRef.current?.blur();
          setMode(false);
          setCommand(":");
        } else if (event.key === "Backspace") {
          setCommand((current) =>
            current.length > 1 ? current.slice(0, -1) : current,
          );
        } else if (event.key.length === 1) {
          setCommand((current) => current + event.key);
        }
        return;
      }

      const directCommand =
        event.key === "G" ? "G" : event.key.toLocaleLowerCase();
      if (
        command === ":" &&
        ["j", "k", "d", "u", "G"].includes(directCommand)
      ) {
        execute(directCommand);
        setCommand(":");
      } else if (command === ":g" && event.key === "g") {
        execute("gg");
        setCommand(":");
      } else if (event.key === "Escape") {
        setMode(false);
        setHelpOpen(false);
        setCommand(":");
      } else if (event.key === "Enter") {
        execute(command.slice(1));
        setMode(false);
        setCommand(":");
      } else if (event.key === "Backspace") {
        setCommand((current) =>
          current.length > 1 ? current.slice(0, -1) : current,
        );
      } else if (event.key.length === 1) {
        setCommand((current) => current + event.key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cancel,
    command,
    execute,
    mode,
    resetSearch,
    searchActive,
    searchQuery,
    setSearchOpen,
    startSearch,
  ]);

  return {
    state: { mode, command, helpOpen },
    actions: { cancel, setMode, setCommand, setHelpOpen },
    inputRef,
  };
}
