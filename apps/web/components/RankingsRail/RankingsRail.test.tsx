import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { WCA_EVENTS } from "@/lib/wca";
import { RankingsControlsRail, RankingsPagerRail } from "./RankingsRail";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const regions = [
  { key: "world", scope: "world" as const, regionId: "", label: "World" },
];

test("renders paired pager actions with useful labels", () => {
  const markup = renderWithProviders(
    <JumpControlsVisibility visible>
      <RankingsPagerRail
        navigation={{
          currentPosition: 100,
          total: 10_000,
          onJumpUp: () => undefined,
          onJumpDown: () => undefined,
        }}
        search={{
          active: false,
          onPrevious: () => undefined,
          onNext: () => undefined,
        }}
      />
    </JumpControlsVisibility>,
  );
  assert.match(markup, />Jump to top</);
  assert.match(markup, />Down 5,000</);
  assert.match(markup, /data-direction="down"/);
});

test("describes an end-bound pager jump", () => {
  const markup = renderWithProviders(
    <RankingsPagerRail
      navigation={{
        currentPosition: 10_000,
        total: 10_000,
        onJumpUp: () => undefined,
        onJumpDown: () => undefined,
      }}
      search={{
        active: false,
        onPrevious: () => undefined,
        onNext: () => undefined,
      }}
    />,
  );
  assert.match(markup, />Up 5,000</);
  assert.match(markup, />Jump to end</);
});

test("keeps directional pager actions interactive while a jump is settling", () => {
  const markup = renderWithProviders(
    <RankingsPagerRail
      navigation={{
        busy: true,
        currentPosition: 5_001,
        total: 10_000,
        onJumpUp: () => undefined,
        onJumpDown: () => undefined,
      }}
      search={{
        active: false,
        onPrevious: () => undefined,
        onNext: () => undefined,
      }}
    />,
  );
  assert.doesNotMatch(markup, /Jump-pagerButton"[^>]*disabled=""/);
});

test("renders the ranking settings and search in one rail", () => {
  const markup = renderWithProviders(
    <RankingsControlsRail
      controls={{
        event: WCA_EVENTS[0],
        onEventChange: () => undefined,
        rankingType: "single",
        onRankingTypeChange: () => undefined,
        gender: [],
        onGenderChange: () => undefined,
        regions,
        regionSelection: { scope: "world", regionId: "" },
        onRegionChange: () => undefined,
        compactResultType: false,
      }}
      search={{
        findOpen: false,
        findQuery: "",
        findError: "",
        findLoading: false,
        findPending: false,
        findMatches: [],
        findIndex: 0,
        onSearchOpen: () => undefined,
        onSearchClose: () => undefined,
        onSearchQueryChange: () => undefined,
        onSearchCycle: () => undefined,
      }}
    />,
  );
  assert.match(markup, /class="RankingsRailTransition"/);
  assert.match(markup, /class="Jump RankingsRail Jump--rankings"/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /Single/);
  assert.match(markup, /Search names or WCA IDs/);
  assert.match(markup, /class="findIcon"[^>]*tabindex="-1"/);
  assert.match(markup, /class="findInput"[^>]*tabindex="0"/);
  assert.match(markup, /aria-label="Gender"/);
});

test("makes the search icon a backward tab stop only when a query exists", () => {
  const search = {
    findOpen: true,
    findQuery: "Feliks",
    findError: "",
    findLoading: false,
    findPending: false,
    findMatches: [],
    findIndex: 0,
    onSearchOpen: () => undefined,
    onSearchClose: () => undefined,
    onSearchQueryChange: () => undefined,
    onSearchCycle: () => undefined,
  };
  const markup = renderWithProviders(
    <RankingsControlsRail
      controls={{
        event: WCA_EVENTS[0],
        onEventChange: () => undefined,
        rankingType: "single",
        onRankingTypeChange: () => undefined,
        gender: [],
        onGenderChange: () => undefined,
        regions,
        regionSelection: { scope: "world", regionId: "" },
        onRegionChange: () => undefined,
        compactResultType: false,
      }}
      search={search}
    />,
  );

  assert.match(markup, /class="findIcon"[^>]*tabindex="0"/);
  assert.match(markup, /class="findClose"[^>]*tabindex="0"/);
});

test("renders the person ranking period control in the settings rail", () => {
  const markup = renderWithProviders(
    <RankingsControlsRail
      controls={{
        event: WCA_EVENTS[0],
        onEventChange: () => undefined,
        rankingType: "single",
        onRankingTypeChange: () => undefined,
        period: {
          options: [
            { value: "", label: "All time" },
            { value: "2026", label: "2026" },
          ],
          value: "",
          onChange: () => undefined,
        },
        gender: [],
        onGenderChange: () => undefined,
        regions,
        regionSelection: { scope: "world", regionId: "" },
        onRegionChange: () => undefined,
        compactResultType: false,
      }}
    />,
  );
  assert.match(markup, /class="[^"]*personYearDropdown Jump-periodPicker"/);
  assert.match(markup, /aria-label="Person ranking period"/);
  assert.match(markup, />All time</);
  assert.ok(
    markup.indexOf("Jump-regionPicker") < markup.indexOf("Jump-periodPicker"),
  );
});

test("shows clickable previous and next person actions only while find navigation is active", () => {
  const props = {
    navigation: {
      currentPosition: 100,
      total: 10_000,
      onJumpUp: () => undefined,
      onJumpDown: () => undefined,
    },
  };
  const active = renderWithProviders(
    <RankingsPagerRail
      {...props}
      search={{
        active: true,
        onPrevious: () => undefined,
        onNext: () => undefined,
      }}
    />,
  );
  const inactive = renderWithProviders(
    <RankingsPagerRail
      {...props}
      search={{
        active: false,
        onPrevious: () => undefined,
        onNext: () => undefined,
      }}
    />,
  );
  assert.match(active, /data-search-navigation="true"/);
  assert.match(active, /aria-hidden="false"/);
  assert.match(active, /Previous person/);
  assert.match(active, /Next person/);
  assert.doesNotMatch(
    active,
    /Previous person<\/span><\/button><button[^>]+disabled/,
  );
  assert.doesNotMatch(inactive, /data-search-navigation="true"/);
  assert.match(inactive, /aria-hidden="true"/);
  assert.match(
    inactive,
    /Previous person<\/span><\/button><button[^>]+disabled/,
  );
});

test("makes find navigation interactive only while search navigation is active", async () => {
  const css = await readFile(
    new URL("./RankingsRail.css", import.meta.url),
    "utf8",
  );
  const inputContainerCss = await readFile(
    new URL("../InputContainer/InputContainer.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /--rail-event-icon-slot-width: 48px;/);
  assert.match(
    css,
    /\.Jump-eventControl > \.EventPicker-preview \.EventPicker-name \{[^}]*left: var\(--rail-event-icon-slot-width\);/,
  );
  assert.match(
    css,
    /\.Jump-eventControl > \.EventPicker-preview\[aria-expanded="true"\] \{\s*box-shadow: inset 0 0 0 2px var\(--focus-ring\);/,
  );
  assert.match(
    css,
    /\.Jump \.findBar--rail \.findIcon \{\s*padding-right: 4px;/,
  );
  assert.match(
    css,
    /\.Jump \.findBar--rail:is\(\[data-has-text="true"\], \[data-open="true"\]\) \.findIcon \{\s*padding-right: 0;\s*padding-left: 4px;/,
  );
  assert.match(
    css,
    /\.Jump \.findBar--rail\[data-open="false"\]\[data-has-text="false"\] \.findInput \{\s*position: absolute;\s*inset: 0;\s*width: 100%;\s*height: 100%;[^}]*opacity: 0;\s*pointer-events: none;/,
  );
  assert.match(
    css,
    /\.Jump \.Jump-periodPicker \.TextDropdown-trigger\[aria-expanded="true"\] \{\s*background: transparent;\s*box-shadow: inset 0 0 0 2px var\(--focus-ring\);/,
  );
  assert.match(
    css,
    /\.Jump \.genderPickerTrigger\[aria-expanded="true"\] \{\s*border-color: var\(--border-subtle\);/,
  );
  assert.match(
    css,
    /\.Jump \.genderPickerTrigger \{[^}]*transition: color 150ms ease;/,
  );
  assert.match(
    css,
    /\.Jump \.Jump-regionPicker \.regionPickerTrigger \{[^}]*transition: color 150ms ease;/,
  );
  assert.match(
    css,
    /\.Jump-resultTypeToggle:hover \{[^}]*color: var\(--focus\);/,
  );
  assert.match(
    css,
    /\.Jump-resultTypeToggle:focus-visible \{[^}]*color: var\(--text-muted\);/,
  );
  assert.match(
    css,
    /\.Jump-pagerActions > \.Jump-pagerButton:first-child \{\s*padding-left: calc\(0\.75em \+ 4px\);/,
  );
  assert.match(
    css,
    /\.Jump-pagerActions > \.Jump-pagerButton:last-child \{\s*padding-right: calc\(0\.75em \+ 4px\);/,
  );
  assert.match(
    css,
    /\.Jump-pagerButton--me \{\s*padding-inline: 0\.75em;\s*text-align: center;/,
  );
  assert.match(
    inputContainerCss,
    /\.InputContainer-item \+ \.InputContainer-item \{\s*border-inline-start: 1px solid var\(--border-subtle\);/,
  );
  assert.match(
    css,
    /\.Jump-periodControl \{\s*height: var\(--rail-control-height\);/,
  );
  assert.match(
    css,
    /\.Jump-regionControl \{[^}]*flex: 1 1 var\(--rail-select-width\);/,
  );
  assert.match(
    css,
    /\.Jump-genderControl \{\s*height: var\(--rail-control-height\);/,
  );
  assert.match(
    css,
    /\.Jump--pager\[data-search-navigation="true"\] \.Jump-pagerActions \{\s*opacity: 0;\s*pointer-events: none;/,
  );
  assert.match(
    css,
    /\.Jump--pager\[data-search-navigation="true"\] \{\s*width: min\(26em, calc\(100vw - 2em\)\);/,
  );
  assert.match(
    css,
    /\.Jump--pager\[data-search-navigation="true"\] \.Jump-searchNavigation \{\s*opacity: 1;\s*pointer-events: auto;/,
  );
  assert.match(
    css,
    /\.Jump-searchNavigation \{\s*position: absolute;[^}]*opacity: 0;\s*pointer-events: none;/,
  );
});
