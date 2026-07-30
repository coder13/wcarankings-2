"use client";

import { useId, useState } from "react";
import { Dropdown } from "../Dropdown/Dropdown";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { genderFiltersLabel, genderLabel, normalizeGenderFilters, type GenderFilter } from "@/lib/wca";

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
  const listboxId = useId();
  const options: Array<{ value: GenderFilter | null; label: string }> = [
    { value: null, label: genderLabel(null) },
    { value: "m" as const, label: genderLabel("m") },
    { value: "f" as const, label: genderLabel("f") },
    { value: "o" as const, label: genderLabel("o") },
  ];
  const selectedLabel = genderFiltersLabel(value);

  return (
    <Dropdown className={`genderPicker ${className}`.trim()} open={open} onOpenChange={setOpen}>
      <button
        className="genderPickerTrigger regionPickerTrigger"
        type="button"
        aria-label="Gender"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
      >
        {selectedLabel}
      </button>
      <SelectChevronIcon />
      <div className="genderPickerMenu regionPickerMenu Dropdown-menu" id={listboxId} data-open={open} role="listbox" aria-label="Gender" aria-multiselectable="true" aria-hidden={!open}>
        <div className="regionOptions">
          {options.map((option) => (
            <button
              className={`regionOption${(option.value === null ? value.length === 0 : value.includes(option.value)) ? " isSelected" : ""}`}
              key={option.label}
              type="button"
              role="option"
              aria-selected={option.value === null ? value.length === 0 : value.includes(option.value)}
              onClick={() => {
                if (option.value === null) {
                  onChange([]);
                  return;
                }
                const next = value.includes(option.value)
                  ? value.filter((current) => current !== option.value)
                  : [...value, option.value];
                onChange(normalizeGenderFilters(next));
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
