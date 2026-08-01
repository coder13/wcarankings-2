"use client";

import { useId, useState } from "react";
import { Dropdown } from "../Dropdown/Dropdown";
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
  const listboxId = useId();
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
        {genderFiltersLabel(value)}
      </button>
      <SelectChevronIcon />
      <div className="genderPickerMenu regionPickerMenu Dropdown-menu" id={listboxId} data-open={open} role="listbox" aria-label="Gender" aria-multiselectable="true" aria-hidden={!open}>
        <div className="regionOptions">
          {GENDER_OPTIONS.map((option) => (
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
