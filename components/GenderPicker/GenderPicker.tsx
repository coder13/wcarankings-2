"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Dropdown } from "../Dropdown/Dropdown";
import { nextVerticalOptionIndex } from "../Dropdown/optionNavigation";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { genderFiltersLabel, genderLabel, normalizeGenderFilters, type GenderFilter } from "@/lib/wca";

const GENDER_OPTIONS: Array<{
  value: GenderFilter | null;
  label: string;
}> = [
  { value: null, label: genderLabel(null) },
  { value: "m", label: genderLabel("m") },
  { value: "f", label: genderLabel("f") },
  { value: "o", label: genderLabel("o") },
];

export function GenderPicker({
  value,
  onChange,
  className = "",
}: {
  value: readonly GenderFilter[];
  onChange: (value: GenderFilter[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();
  const isSelected = (option: (typeof GENDER_OPTIONS)[number]) =>
    option.value === null
      ? value.length === 0
      : value.includes(option.value);
  const selectedIndex = Math.max(0, GENDER_OPTIONS.findIndex(isSelected));
  const setPickerOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      window.setTimeout(() => optionRefs.current[selectedIndex]?.focus());
    }
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      if (event.shiftKey) {
        event.preventDefault();
        close();
        return;
      }
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const focusedIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    const nextIndex = nextVerticalOptionIndex({
      key: event.key,
      currentIndex: focusedIndex === -1 ? selectedIndex : focusedIndex,
      optionCount: GENDER_OPTIONS.length,
    });
    if (event.key.startsWith("Arrow")) event.preventDefault();
    if (nextIndex !== undefined) optionRefs.current[nextIndex]?.focus();
  };

  return (
    <Dropdown className={`genderPicker ${className}`.trim()} open={open} onOpenChange={setPickerOpen}>
      <button
        ref={triggerRef}
        className="genderPickerTrigger regionPickerTrigger"
        type="button"
        aria-label="Gender"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setPickerOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setPickerOpen(true);
          }
        }}
      >
        {genderFiltersLabel(value)}
      </button>
      <SelectChevronIcon />
      <div className="genderPickerMenu regionPickerMenu Dropdown-menu" id={listboxId} data-open={open} role="listbox" aria-label="Gender" aria-multiselectable="true" aria-hidden={!open} onKeyDown={handleMenuKeyDown}>
        <div className="regionOptions" tabIndex={-1}>
          {GENDER_OPTIONS.map((option, index) => (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              className={`regionOption${isSelected(option) ? " isSelected" : ""}`}
              key={option.label}
              type="button"
              role="option"
              tabIndex={open && index === selectedIndex ? 0 : -1}
              aria-selected={isSelected(option)}
              onClick={() => {
                if (option.value === null) {
                  onChange([]);
                  return;
                }
                onChange(normalizeGenderFilters(
                  value.includes(option.value)
                    ? value.filter((current) => current !== option.value)
                    : [...value, option.value],
                ));
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </Dropdown>
  );
}
