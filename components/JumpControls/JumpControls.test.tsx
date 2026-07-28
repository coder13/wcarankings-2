import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WCA_EVENTS } from "@/lib/wca";
import { RankingsJumpRail, RankingsPagerRail } from "./JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

test("renders a jump action with a useful label", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <RankingsPagerRail
        upArmed={false}
        downArmed={false}
        currentPosition={6_000}
        total={20_000}
        onJumpUp={() => undefined}
        onJumpDown={() => undefined}
        searchActive={false}
        onSearchPrevious={() => undefined}
        onSearchNext={() => undefined}
      />
    </JumpControlsVisibility>,
  );
  assert.match(markup, /Up 5,000/);
  assert.match(markup, /Down 5,000/);
  assert.match(markup, /data-direction="down"/);
});

test("groups ranking controls and search in one rail", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <RankingsJumpRail
        event={WCA_EVENTS[0]}
        onEventChange={() => undefined}
        rankingType="single"
        onRankingTypeChange={() => undefined}
        regions={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
        regionSelection={{ scope: "world", regionId: "" }}
        onRegionChange={() => undefined}
        findOpen={false}
        findQuery=""
        findError=""
        findLoading={false}
        findPending={false}
        findMatches={[]}
        findIndex={0}
        onSearchOpen={() => undefined}
        onSearchClose={() => undefined}
        onSearchQueryChange={() => undefined}
        onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>,
  );
  assert.match(markup, /JumpRail Jump--rankings/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /Switch to average rankings/);
  assert.match(markup, /Single/);
  assert.match(markup, /aria-label="Region"/);
  assert.match(markup, /Search names or WCA IDs/);
});

test("splits the lower search rail between previous and next people", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <RankingsPagerRail
        upArmed={false}
        downArmed={false}
        currentPosition={100}
        total={10_000}
        onJumpUp={() => undefined}
        onJumpDown={() => undefined}
        searchActive
        onSearchPrevious={() => undefined}
        onSearchNext={() => undefined}
      />
    </JumpControlsVisibility>,
  );

  assert.match(markup, /data-search-navigation="true"/);
  assert.match(markup, /Previous person/);
  assert.match(markup, /Next person/);
});
