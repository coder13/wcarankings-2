import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./ThemeToggle";
import {
  getThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./theme";

test("resolves saved and system color preferences", () => {
  assert.equal(THEME_STORAGE_KEY, "wca-rankings-theme");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme(null, false), "light");
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(getThemePreference("light"), "light");
  assert.equal(getThemePreference("dark"), "dark");
  assert.equal(getThemePreference("system"), "system");
  assert.equal(getThemePreference(null), "system");
  assert.equal(getThemePreference("unexpected"), "system");
});

test("renders an accessible theme menu button", () => {
  const markup = renderToStaticMarkup(<ThemeToggle />);
  assert.match(markup, /class="themeToggle"/);
  assert.match(markup, /aria-label="Choose color theme"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /type="button"/);
});
