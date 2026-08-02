import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { WCA_EVENTS } from "@/lib/wca";
import { RankingsControlsRail, RankingsPagerRail } from "./RankingsRail";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const regions = [{ key: "world", scope: "world" as const, regionId: "", label: "World" }];

test("renders paired pager actions with useful labels", () => {
  const markup = renderWithProviders(<JumpControlsVisibility visible><RankingsPagerRail navigation={{ currentPosition: 100, total: 10_000, onJumpUp: () => undefined, onJumpDown: () => undefined }} search={{ active: false, onPrevious: () => undefined, onNext: () => undefined }} /></JumpControlsVisibility>);
  assert.match(markup, />Top</);
  assert.match(markup, />\+5000</);
  assert.match(markup, /data-direction="down"/);
});

test("disables pager actions while a jump is settling", () => {
  const markup = renderWithProviders(<RankingsPagerRail navigation={{ busy: true, currentPosition: 5_001, total: 10_000, onJumpUp: () => undefined, onJumpDown: () => undefined }} search={{ active: false, onPrevious: () => undefined, onNext: () => undefined }} />);
  assert.match(markup, /disabled=""/);
});

test("renders the ranking settings and search in one rail", () => {
  const markup = renderWithProviders(<RankingsControlsRail controls={{ event: WCA_EVENTS[0], onEventChange: () => undefined, rankingType: "single", onRankingTypeChange: () => undefined, gender: [], onGenderChange: () => undefined, regions, regionSelection: { scope: "world", regionId: "" }, onRegionChange: () => undefined, compactResultType: false }} search={{ findOpen: false, findQuery: "", findError: "", findLoading: false, findPending: false, findMatches: [], findIndex: 0, onSearchOpen: () => undefined, onSearchClose: () => undefined, onSearchQueryChange: () => undefined, onSearchCycle: () => undefined }} />);
  assert.match(markup, /class="RankingsRailTransition"/);
  assert.match(markup, /class="Jump RankingsRail Jump--rankings"/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /Single/);
  assert.match(markup, /Search names or WCA IDs/);
  assert.match(markup, /aria-label="Gender"/);
});

test("shows previous and next person actions while searching", () => {
  const markup = renderWithProviders(<RankingsPagerRail navigation={{ currentPosition: 100, total: 10_000, onJumpUp: () => undefined, onJumpDown: () => undefined }} search={{ active: true, onPrevious: () => undefined, onNext: () => undefined }} />);
  assert.match(markup, /data-search-navigation="true"/);
  assert.match(markup, /Previous person/);
  assert.match(markup, /Next person/);
});
