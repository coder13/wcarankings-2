import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WCA_EVENTS } from "@/lib/wca";
import { JumpDownControls, JumpUpControls } from "./JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

test("renders a jump action with a useful label", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <JumpDownControls
      armed={false}
      navigationPending={false}
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

test("disables jump navigation while a jump is pending", () => {
  const markup = renderToStaticMarkup(
    <JumpDownControls
      armed={false}
      navigationPending
      currentPosition={100}
      total={10_000}
      onJump={() => undefined}
      searchActive={false}
      onSearchPrevious={() => undefined}
      onSearchNext={() => undefined}
    />,
  );

  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-busy="true"/);
});

test("groups the upper jump and search actions in one rail", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <JumpUpControls
      armed={false}
      navigationPending={false}
      currentPosition={10_000}
      onJump={() => undefined}
      event={WCA_EVENTS[0]}
      onEventChange={() => undefined}
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
  assert.match(markup, /class="Jump"/);
  assert.match(markup, /Jump 5,000/);
  assert.match(markup, /cubing-icon event-333/);
  assert.match(markup, /aria-label="3x3x3 Cube"/);
  assert.match(markup, /aria-haspopup="listbox"/);
  assert.match(markup, /Search names or WCA IDs/);
});

test("splits the lower search rail between previous and next people", () => {
  const markup = renderToStaticMarkup(
    <JumpControlsVisibility visible>
      <JumpDownControls
      armed={false}
      navigationPending={false}
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
