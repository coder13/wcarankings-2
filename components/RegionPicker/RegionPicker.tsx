"use client";

import { useId, useRef, useState } from "react";
import CloseIcon from "../Icon/close.svg?react";
import SelectChevronIcon from "../Icon/select-chevron.svg?react";
import { Dropdown } from "../Dropdown/Dropdown";
import type { RegionOption, RegionSelection } from "../RankingsExplorer/types";

export function RegionPicker({
  options,
  selected,
  onChange,
  className,
  disabled = false,
}: {
  options: RegionOption[];
  selected: RegionSelection;
  onChange: (option: RegionOption) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selectedOption =
    options.find(
      (option) =>
        option.scope === selected.scope && option.regionId === selected.regionId,
    ) ?? options[0];
  const worldOption =
    options.find((option) => option.scope === "world") ?? options[0];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        option.label.toLocaleLowerCase().includes(normalizedQuery),
      )
    : options;
  const continents = filteredOptions.filter(
    (option) => option.scope === "continent",
  );
  const countries = filteredOptions.filter(
    (option) => option.scope === "country",
  );
  const visibleOptions = filteredOptions.length
    ? [
        ...(options[0] ? [options[0]] : []),
        ...continents,
        ...countries,
      ]
    : [];
  const defaultActiveOption =
    visibleOptions.find((option) => option.scope !== "world") ??
    visibleOptions[0];
  const effectiveActiveKey = visibleOptions.some(
    (option) => option.key === activeKey,
  )
    ? activeKey
    : defaultActiveOption?.key ?? null;
  const activeIndex = visibleOptions.findIndex(
    (option) => option.key === effectiveActiveKey,
  );

  const setPickerOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setActiveKey(null);
    }
    setOpen(nextOpen);
  };

  const choose = (option: RegionOption) => {
    onChange(option);
    setQuery("");
    setActiveKey(null);
    setOpen(false);
  };

  const renderOption = (option: RegionOption) => {
    const optionIndex = visibleOptions.findIndex(
      (visibleOption) => visibleOption.key === option.key,
    );
    const isSelected = selectedOption?.key === option.key;
    const isActive = effectiveActiveKey === option.key;

    return (
      <button
        ref={(element) => {
          if (element && isActive && open) {
            element.scrollIntoView({ block: "nearest" });
          }
        }}
        id={`${listboxId}-option-${optionIndex}`}
        className={`regionOption${isSelected ? " isSelected" : ""}${
          isActive ? " isActive" : ""
        }`}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={isSelected}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveKey(option.key)}
        onClick={() => {
          choose(option);
          searchRef.current?.blur();
        }}
        key={option.key}
      >
        <span>{option.label}</span>
      </button>
    );
  };

  return (
    <Dropdown
      className={`regionPicker${disabled ? " isDisabled" : ""}${className ? ` ${className}` : ""}`}
      open={open}
      onOpenChange={setPickerOpen}
    >
      <input
        className="regionPickerTrigger"
        id="region-picker-button"
        type="text"
        ref={searchRef}
        value={open ? query : selectedOption?.label ?? "World"}
        onFocus={() => {
          if (disabled) return;
          if (!open) setQuery("");
          setActiveKey(
            options.find((option) => option.scope !== "world")?.key ??
              options[0]?.key ??
              null,
          );
          setPickerOpen(true);
        }}
        onClick={() => {
          if (disabled) return;
          setPickerOpen(true);
        }}
        onBlur={() => {
          setQuery("");
          setActiveKey(null);
          setPickerOpen(false);
        }}
        onChange={(event) => {
          if (disabled) return;
          setQuery(event.target.value);
          setActiveKey(null);
          setPickerOpen(true);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setQuery("");
            setActiveKey(null);
            setOpen(false);
            return;
          }

          if (event.key === "Tab") {
            setQuery("");
            setActiveKey(null);
            setOpen(false);
            return;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setQuery("");
              setActiveKey(
                options.find((option) => option.scope !== "world")?.key ??
                  options[0]?.key ??
                  null,
              );
              setPickerOpen(true);
              return;
            }

            if (visibleOptions.length === 0) return;
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const currentIndex = activeIndex === -1 ? 0 : activeIndex;
            const nextIndex =
              (currentIndex + direction + visibleOptions.length) %
              visibleOptions.length;
            setActiveKey(visibleOptions[nextIndex].key);
            return;
          }

          if (event.key === "Enter" && open && activeIndex !== -1) {
            event.preventDefault();
            choose(visibleOptions[activeIndex]);
            event.currentTarget.blur();
          }
        }}
        role="combobox"
        disabled={disabled}
        aria-label="Region"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && activeIndex !== -1
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
      />
      {selectedOption?.scope === "world" ? (
        <SelectChevronIcon />
      ) : (
        <button
          className="regionPickerClear"
          type="button"
          aria-label="Clear region"
          title="Clear region"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (worldOption) choose(worldOption);
            searchRef.current?.blur();
          }}
        >
          <CloseIcon />
        </button>
      )}
      <div
        className="regionPickerMenu Dropdown-menu"
        id={listboxId}
        data-open={open}
        role="listbox"
        aria-label="Region"
        aria-hidden={!open}
      >
        {filteredOptions.length === 0 ? (
          <div className="regionEmpty">No matching regions</div>
        ) : (
          <div className="regionOptions">
            {options[0] && renderOption(options[0])}
            {continents.length > 0 && (
              <div className="regionGroupLabel">Continents</div>
            )}
            {continents.map(renderOption)}
            {countries.length > 0 && (
              <div className="regionGroupLabel">Countries</div>
            )}
            {countries.map(renderOption)}
          </div>
        )}
      </div>
    </Dropdown>
  );
}
