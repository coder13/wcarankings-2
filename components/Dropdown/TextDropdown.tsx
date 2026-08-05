"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { Dropdown } from "./Dropdown";
import { nextVerticalOptionIndex } from "./optionNavigation";

export type TextDropdownOption<T extends string> = {
  value: T;
  label: string;
};

export type TextDropdownOptionGroup<T extends string> = {
  label?: string;
  options: readonly TextDropdownOption<T>[];
};

export function TextDropdown<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
  triggerPrefix,
  hideSelectedOption = false,
  optionGroups,
}: {
  options: readonly TextDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  triggerPrefix?: ReactNode;
  hideSelectedOption?: boolean;
  optionGroups?: readonly TextDropdownOptionGroup<T>[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const visibleOptionGroups = (optionGroups ?? [{ options }])
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => !hideSelectedOption || option.value !== value,
      ),
    }))
    .filter((group) => group.options.length > 0);
  const visibleOptions = visibleOptionGroups.flatMap((group) => group.options);
  const selectedOptionIndex = visibleOptions.findIndex(
    (option) => option.value === value,
  );
  const initialFocusIndex = Math.max(0, selectedOptionIndex);
  const setDropdownOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      window.setTimeout(() =>
        optionRefs.current[initialFocusIndex]?.focus(),
      );
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
      currentIndex:
        focusedIndex === -1 ? initialFocusIndex : focusedIndex,
      optionCount: visibleOptions.length,
    });
    if (event.key.startsWith("Arrow")) event.preventDefault();
    if (nextIndex !== undefined) optionRefs.current[nextIndex]?.focus();
  };

  return (
    <Dropdown className={`TextDropdown${className ? ` ${className}` : ""}`} open={open} onOpenChange={setDropdownOpen}>
      <button
        ref={triggerRef}
        className="TextDropdown-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setDropdownOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setDropdownOpen(true);
          }
        }}
      >
        <span>
          {triggerPrefix}
          {options.find((option) => option.value === value)!.label}
        </span>
        <SelectChevronIcon />
      </button>
      <div className="TextDropdown-options Dropdown-menu" data-open={open} role="listbox" aria-label={ariaLabel} onKeyDown={handleMenuKeyDown}>
        {visibleOptionGroups.map((group) => (
          <div
            className="TextDropdown-optionGroup"
            key={group.label ?? group.options[0]?.value}
            role={group.label ? "group" : undefined}
            aria-label={group.label}
          >
            {group.label && <div className="TextDropdown-optionGroupLabel">{group.label}</div>}
            {group.options.map((option) => {
              const index = visibleOptions.indexOf(option);
              return (
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  key={option.value}
                  type="button"
                  role="option"
                  tabIndex={open && index === initialFocusIndex ? 0 : -1}
                  aria-selected={option.value === value}
                  className={option.value === value ? "isSelected" : ""}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Dropdown>
  );
}
