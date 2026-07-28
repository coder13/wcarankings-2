import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WCA_EVENTS } from "@/lib/wca";
import { JumpDownControls, MatrixJumpRail, RankingsJumpRail } from "./JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

test("renders a jump action with a useful label", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <JumpDownControls
      armed={false}
      currentPosition={100}
      total={10_000}
      onJump={() => undefined}
      searchActive={false}
      onSearchPrevious={() => undefined}
      onSearchNext={() => undefined}
      />
    </JumpControlsVisibility>,
  );
  assert.match(markup, /Jump 5,000/);
  assert.match(markup, /data-direction="down"/);
});

test("groups the upper jump and search actions in one rail", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <RankingsJumpRail
      armed={false}
      currentPosition={10_000}
      onJump={() => undefined}
      event={WCA_EVENTS[0]}
      onEventChange={() => undefined}
      rankingType="single"
      onRankingTypeChange={() => undefined}
      regions={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
      regionSelection={{ scope: "world", regionId: "" }}
      onRegionChange={() => undefined}
      findQuery=""
      findError=""
      findLoading={false}
      findPending={false}
      findMatchCount={0}
      findIndex={0}
      onSearchOpen={() => undefined}
      onSearchClose={() => undefined}
      onSearchQueryChange={() => undefined}
      onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>,
  );
  assert.match(markup, /class="Jump JumpRail Jump--rankings"/);
  assert.match(markup, /Jump 5,000/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /Switch to average rankings/);
  assert.match(markup, /Single/);
  assert.match(markup, /aria-label="Region"/);
  assert.match(markup, /Search names or WCA IDs/);
});

test("keeps matrix settings behind a dedicated expandable rail", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <MatrixJumpRail
        armed
        currentPosition={1}
        onJump={() => undefined}
        rankingType="single"
        onRankingTypeChange={() => undefined}
        regions={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
        regionSelection={{ scope: "world", regionId: "" }}
        onRegionChange={() => undefined}
        findQuery=""
        findError=""
        findLoading={false}
        findPending={false}
        findMatchCount={0}
        onSearchOpen={() => undefined}
        onSearchClose={() => undefined}
        onSearchQueryChange={() => undefined}
      />
    </JumpControlsVisibility>,
  );

  assert.match(markup, /Jump--matrix/);
  assert.match(markup, /aria-label="Ranking settings"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /aria-pressed="true">Single/);
  assert.match(markup, /aria-label="Region"/);
  assert.doesNotMatch(markup, /cubing-icon/);
});

test("splits the lower search rail between previous and next people", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <JumpDownControls
      armed={false}
      currentPosition={100}
      total={10_000}
      onJump={() => undefined}
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
