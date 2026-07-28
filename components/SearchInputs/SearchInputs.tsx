"use client";

import { useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import CloseIcon from "../Icon/close.svg?react";
import SearchIcon from "../Icon/search.svg?react";

export function SearchInputs({
  barRef,
  inputRef,
  findOpen,
  findQuery,
  findError,
  findLoading,
  findPending,
  findMatchCount,
  findIndex,
  onOpen,
  onClose,
  onQueryChange,
  onCycle,
}: {
  barRef?: Ref<HTMLDivElement>;
  inputRef?: (input: HTMLInputElement | null) => void;
  findOpen: boolean;
  findQuery: string;
  findError: string;
  findLoading: boolean;
  findPending: boolean;
  findMatchCount: number;
  findIndex?: number;
  onOpen: () => void;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onCycle?: (direction: -1 | 1) => void;
}) {
  const localInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef?.(localInputRef.current);
    return () => inputRef?.(null);
  }, [inputRef]);

  const openSearch = () => {
    onOpen();
    localInputRef.current?.focus();
    setTimeout(() => localInputRef.current?.focus(), 25);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCycle?.(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      localInputRef.current?.blur();
      onClose();
    }
  };
  const searching = findLoading || findPending;
  let status = "";
  if (findError) status = findError;
  else if (findQuery.trim()) {
    status = findMatchCount
      ? findIndex === undefined
        ? `${findMatchCount} matches`
        : `${findIndex + 1} of ${findMatchCount}`
      : "No matches";
  }

  const findBar = (
    <div
      ref={barRef}
      className="findBar findBar--header"
      data-has-text={findQuery.length > 0}
      role="search"
    >
      <button
        className="findIcon"
        type="button"
        tabIndex={-1}
        aria-label="Search names or WCA IDs"
        aria-expanded={findOpen}
        title="Search names or WCA IDs (Ctrl+F)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openSearch}
      >
        <SearchIcon />
      </button>
      <input
        ref={localInputRef}
        className="findInput"
        type="text"
        value={findQuery}
        onFocus={onOpen}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Find a name or WCA ID"
      />
      <span
        className={`findStatus${findError ? " isError" : ""}`}
        aria-live="polite"
      >
        {searching ? (
          <span className="searchSpinner" aria-label="Searching" />
        ) : (
          status
        )}
      </span>
      <button
        className="findClose"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          localInputRef.current?.blur();
          onClose();
        }}
        aria-label="Close search"
      >
        <CloseIcon />
      </button>
    </div>
  );

  return findBar;
}
