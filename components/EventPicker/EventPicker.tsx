"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import { nextEventPickerOptionIndex } from "./eventPickerNavigation";

type WcaEvent = (typeof WCA_EVENTS)[number];

export type EventPickerOption = WcaEvent | {
  id: string;
  name: string;
  shortName: string;
  symbol: string;
};

function isWcaEvent(option: EventPickerOption): option is WcaEvent {
  return WCA_EVENTS.some((candidate) => candidate.id === option.id);
}

export function EventPicker<T extends EventPickerOption>({
  event,
  options = WCA_EVENTS as unknown as readonly T[],
  leadingOptions = [],
  additionalOptions = [],
  onChange,
  onTriggerReady,
}: {
  event: T;
  options?: readonly T[];
  leadingOptions?: readonly T[];
  additionalOptions?: readonly T[];
  onChange: (eventId: T["id"]) => void;
  onTriggerReady?: (trigger: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const allOptions = [...leadingOptions, ...options, ...additionalOptions];
  const selectedIndex = allOptions.findIndex((option) => option.id === event.id);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (mouseEvent: MouseEvent) => {
      const target = mouseEvent.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  const setPickerOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setTimeout(() => optionRefs.current[selectedIndex]?.focus());
    }
  };

  const close = () => {
    setPickerOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key === "Tab") {
      setPickerOpen(false);
      return;
    }

    const focusedIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    const currentIndex = focusedIndex === -1 ? selectedIndex : focusedIndex;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      close();
      return;
    }

    const nextIndex = nextEventPickerOptionIndex({
      key: keyboardEvent.key,
      currentIndex,
      leadingCount: leadingOptions.length,
      eventCount: options.length,
      additionalCount: additionalOptions.length,
    });

    if (keyboardEvent.key.startsWith("Arrow")) {
      keyboardEvent.preventDefault();
    }

    if (nextIndex !== undefined) {
      optionRefs.current[nextIndex]?.focus();
    }
  };

  const renderOption = (option: T, index: number) => (
    <button
      ref={(element) => {
        optionRefs.current[index] = element;
      }}
      key={option.id}
      className={`EventPicker-option${isWcaEvent(option) ? ` cubing-icon event-${option.id}` : " EventPicker-option--named"}`}
      data-selected={option.id === event.id}
      type="button"
      role="option"
      tabIndex={open && option.id === event.id ? 0 : -1}
      aria-label={option.name}
      aria-selected={option.id === event.id}
      title={option.name}
      onClick={() => {
        onChange(option.id);
        close();
      }}
    >
      {!isWcaEvent(option) && <><span className="EventPicker-optionSymbol" aria-hidden="true">{option.symbol}</span><span>{option.name}</span></>}
    </button>
  );

  return (
    <>
      <button
        ref={(trigger) => {
          triggerRef.current = trigger;
          onTriggerReady?.(trigger);
        }}
        className={`EventPicker-preview${isWcaEvent(event) ? ` cubing-icon event-${event.id}` : " EventPicker-preview--named"}`}
        aria-label={event.name}
        title={event.name}
        aria-haspopup="listbox"
        aria-expanded={open}
        type="button"
        onClick={() => setPickerOpen(!open)}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === "ArrowDown" || keyboardEvent.key === "ArrowUp") {
            keyboardEvent.preventDefault();
            setPickerOpen(true);
          }
        }}
      >
        {!isWcaEvent(event) && <span className="EventPicker-symbol" aria-hidden="true">{event.symbol}</span>}
        <span className="EventPicker-name">{event.name}</span>
      </button>
      <div
        ref={menuRef}
        className="EventPicker-menu"
        data-open={open}
        role="listbox"
        aria-label="Choose event"
        aria-hidden={!open}
        onKeyDown={handleMenuKeyDown}
      >
        {leadingOptions.length > 0 && (
          <div className="EventPicker-leadingOptions">
            {leadingOptions.map(renderOption)}
          </div>
        )}
        <div className="EventPicker-eventOptions">
          {options.map((option, index) =>
            renderOption(option, leadingOptions.length + index),
          )}
        </div>
        {additionalOptions.length > 0 && (
          <div className="EventPicker-additionalOptions">
            {additionalOptions.map((option, index) =>
              renderOption(
                option,
                leadingOptions.length + options.length + index,
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
