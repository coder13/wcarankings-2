"use client";

import { useCallback, useRef } from "react";

export type RankingCommands = {
  registerSearchInput: (input: HTMLInputElement | null) => void;
  registerEventPickerTrigger: (trigger: HTMLButtonElement | null) => void;
  focusSearch: () => void;
  openEventPicker: () => boolean;
};

export function useRankingCommands(): RankingCommands {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const eventPickerTriggerRef = useRef<HTMLButtonElement>(null);

  const registerSearchInput = useCallback((input: HTMLInputElement | null) => {
    searchInputRef.current = input;
  }, []);
  const registerEventPickerTrigger = useCallback(
    (trigger: HTMLButtonElement | null) => {
      eventPickerTriggerRef.current = trigger;
    },
    [],
  );
  const focusSearch = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);
  const openEventPicker = useCallback(() => {
    const trigger = eventPickerTriggerRef.current;
    if (!trigger) return false;
    if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
    trigger.focus();
    return true;
  }, []);

  return {
    registerSearchInput,
    registerEventPickerTrigger,
    focusSearch,
    openEventPicker,
  };
}
