"use client";

import { useEffect, useRef, useState } from "react";
import {
  getThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
} from "./theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#fffcff",
  dark: "#121417",
};

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", THEME_COLORS[theme]);
  });
}

function ThemeIcon({ theme }: { theme: Theme | null }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.6 15.6A8.3 8.3 0 0 1 8.4 3.4 8.3 8.3 0 1 0 20.6 15.6Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 22h8M12 18v4" />
    </svg>
  );
}

const THEME_OPTIONS: readonly ThemePreference[] = ["light", "system", "dark"];

function optionLabel(preference: ThemePreference) {
  return preference[0].toUpperCase() + preference.slice(1);
}

export function ThemeToggle() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const loadTheme = (savedValue = window.localStorage.getItem(THEME_STORAGE_KEY)) => {
      const nextPreference = getThemePreference(savedValue);
      const nextTheme = resolveTheme(nextPreference, media.matches);
      applyTheme(nextTheme);
      setPreference(nextPreference);
      setTheme(nextTheme);
    };
    loadTheme();

    const handleChange = () => {
      if (getThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY)) === "system") {
        loadTheme("system");
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) loadTheme(event.newValue);
    };
    media.addEventListener("change", handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      media.removeEventListener("change", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".themeToggle")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const label = preference
    ? `Color theme: ${optionLabel(preference)}`
    : "Choose color theme";

  const selectPreference = (nextPreference: ThemePreference) => {
    const nextTheme = resolveTheme(
      nextPreference,
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    applyTheme(nextTheme);
    setPreference(nextPreference);
    setTheme(nextTheme);
    setOpen(false);
  };

  return (
    <div className="themeMenu" ref={rootRef}>
      <button
        className="themeToggle"
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {preference === "system" ? <SystemIcon /> : <ThemeIcon theme={theme} />}
      </button>

      {open && (
        <div className="themePopover" role="menu" aria-label="Color theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={preference === option}
              onClick={() => selectPreference(option)}
            >
              <span className="themeOptionIcon">
                {option === "system" ? <SystemIcon /> : <ThemeIcon theme={option} />}
              </span>
              <span>{optionLabel(option)}</span>
              <span className="themeOptionCheck" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
