"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WCA_EVENTS } from "@/lib/wca";

export function EventPicker({
  event,
  onChange,
  onTriggerReady,
}: {
  event: (typeof WCA_EVENTS)[number];
  onChange: (eventId: (typeof WCA_EVENTS)[number]["id"]) => void;
  onTriggerReady?: (trigger: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = WCA_EVENTS.findIndex((option) => option.id === event.id);

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
    const columnCount = 5;
    let nextIndex: number | undefined;

    if (
      keyboardEvent.key === "ArrowRight" &&
      currentIndex % columnCount < columnCount - 1 &&
      currentIndex + 1 < WCA_EVENTS.length
    ) {
      nextIndex = currentIndex + 1;
    } else if (keyboardEvent.key === "ArrowLeft" && currentIndex % columnCount > 0) {
      nextIndex = currentIndex - 1;
    } else if (
      keyboardEvent.key === "ArrowDown" &&
      currentIndex + columnCount < WCA_EVENTS.length
    ) {
      nextIndex = currentIndex + columnCount;
    } else if (keyboardEvent.key === "ArrowUp" && currentIndex >= columnCount) {
      nextIndex = currentIndex - columnCount;
    } else if (keyboardEvent.key === "Home") {
      nextIndex = 0;
    } else if (keyboardEvent.key === "End") {
      nextIndex = WCA_EVENTS.length - 1;
    } else if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      close();
      return;
    }

    if (keyboardEvent.key.startsWith("Arrow")) {
      keyboardEvent.preventDefault();
    }

    if (nextIndex !== undefined) {
      optionRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <>
      <button
        ref={(trigger) => {
          triggerRef.current = trigger;
          onTriggerReady?.(trigger);
        }}
        className={`EventPicker-preview cubing-icon event-${event.id}`}
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
        {WCA_EVENTS.map((option, index) => (
          <button
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            key={option.id}
            className={`EventPicker-option cubing-icon event-${option.id}`}
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
          />
        ))}
      </div>
    </>
  );
}
