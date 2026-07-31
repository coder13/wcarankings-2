import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WCA_EVENTS } from "@/lib/wca";
import { RankingsControlsRail, RankingsPagerRail } from "./RankingsRail";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const regions = [{ key: "world", scope: "world" as const, regionId: "", label: "World" }];

test("renders paired pager actions with useful labels", () => {
  const markup = renderToStaticMarkup(<JumpControlsVisibility visible><RankingsPagerRail upArmed={false} downArmed={false} currentPosition={100} total={10_000} onJumpUp={() => undefined} onJumpDown={() => undefined} searchActive={false} onSearchPrevious={() => undefined} onSearchNext={() => undefined} /></JumpControlsVisibility>);
  assert.match(markup, /Jump to top/);
  assert.match(markup, /Down 5,000/);
  assert.match(markup, /data-direction="down"/);
});

test("shows both pager actions from the first page", () => {
  const markup = renderToStaticMarkup(<RankingsPagerRail upArmed={false} downArmed={false} currentPosition={50} total={10_000} onJumpUp={() => undefined} onJumpDown={() => undefined} searchActive={false} onSearchPrevious={() => undefined} onSearchNext={() => undefined} />);
  assert.match(markup, /aria-label="Jump to top"/);
  assert.match(markup, /Down 5,000/);
});

test("keeps an armed jump-to-end action available while navigation settles", () => {
  const markup = renderToStaticMarkup(<RankingsPagerRail upArmed={false} downArmed busy currentPosition={5_001} total={100_000} onJumpUp={() => undefined} onJumpDown={() => undefined} searchActive={false} onSearchPrevious={() => undefined} onSearchNext={() => undefined} />);
  assert.match(markup, /<button class="Jump-pagerButton"><svg[\s\S]*?Jump to end/);
});

test("disables pager actions while a jump is settling", () => {
  const markup = renderToStaticMarkup(<RankingsPagerRail upArmed={false} downArmed={false} busy currentPosition={5_001} total={10_000} onJumpUp={() => undefined} onJumpDown={() => undefined} searchActive={false} onSearchPrevious={() => undefined} onSearchNext={() => undefined} />);
  assert.match(markup, /disabled=""/);
});

test("renders the ranking settings and search in one rail", () => {
  const markup = renderToStaticMarkup(<RankingsControlsRail event={WCA_EVENTS[0]} onEventChange={() => undefined} rankingType="single" onRankingTypeChange={() => undefined} gender={[]} onGenderChange={() => undefined} regions={regions} regionSelection={{ scope: "world", regionId: "" }} onRegionChange={() => undefined} compactResultType={false} findOpen={false} findQuery="" findError="" findLoading={false} findPending={false} findMatches={[]} findIndex={0} onSearchOpen={() => undefined} onSearchClose={() => undefined} onSearchQueryChange={() => undefined} onSearchCycle={() => undefined} />);
  assert.match(markup, /class="RankingsRailTransition"/);
  assert.match(markup, /class="Jump RankingsRail Jump--rankings"/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /Single/);
  assert.match(markup, /Search names or WCA IDs/);
  assert.match(markup, /aria-label="Gender"/);
});

test("shows previous and next person actions while searching", () => {
  const markup = renderToStaticMarkup(<RankingsPagerRail upArmed={false} downArmed={false} currentPosition={100} total={10_000} onJumpUp={() => undefined} onJumpDown={() => undefined} searchActive onSearchPrevious={() => undefined} onSearchNext={() => undefined} />);
  assert.match(markup, /data-search-navigation="true"/);
  assert.match(markup, /Previous person/);
  assert.match(markup, /Next person/);
});
