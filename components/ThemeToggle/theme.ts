export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "wca-rankings-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

export function getThemePreference(value: string | null): ThemePreference {
  return isTheme(value) || value === "system" ? value : "system";
}

export function resolveTheme(
  savedPreference: string | null,
  prefersDark: boolean,
): Theme {
  if (isTheme(savedPreference)) return savedPreference;
  return prefersDark ? "dark" : "light";
}
