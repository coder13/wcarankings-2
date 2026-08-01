"use client";

import { useState, type ReactNode } from "react";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { Dropdown } from "./Dropdown";

export type TextDropdownOption<T extends string> = {
  value: T;
  label: string;
};

export function TextDropdown<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
  triggerPrefix,
  hideSelectedOption = false,
}: {
  options: readonly TextDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  triggerPrefix?: ReactNode;
  hideSelectedOption?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown className={`TextDropdown${className ? ` ${className}` : ""}`} open={open} onOpenChange={setOpen}>
      <button
        className="TextDropdown-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span>
          {triggerPrefix}
          {options.find((option) => option.value === value)!.label}
        </span>
        <SelectChevronIcon />
      </button>
      <div className="TextDropdown-options Dropdown-menu" data-open={open} role="listbox" aria-label={ariaLabel}>
        {options.filter((option) => !hideSelectedOption || option.value !== value).map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === value}
            className={option.value === value ? "isSelected" : ""}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Dropdown>
  );
}
