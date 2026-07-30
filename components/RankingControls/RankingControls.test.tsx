import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingControls } from "./RankingControls";

test("renders event and ranking type controls", () => {
  const markup = renderToStaticMarkup(
    <RankingControls
      eventId="333"
      rankingType="single"
      gender={[]}
      regions={[{ key: "world", scope: "world", regionId: "", label: "World" }]}
      regionSelection={{ scope: "world", regionId: "" }}
      onEventChange={() => undefined}
      onRankingTypeChange={() => undefined}
      onGenderChange={() => undefined}
      onRegionChange={() => undefined}
    />,
  );
  assert.match(markup, /name="Event Id"/);
  assert.match(markup, /class="chooserEventPicker"/);
  assert.match(markup, /class="EventPicker-preview cubing-icon event-333"/);
  assert.match(markup, /data-ranking-type="single"/);
  assert.match(markup, /Single/);
  assert.match(markup, /Average/);
  assert.match(markup, /aria-label="Region"/);
  assert.match(markup, /aria-label="Gender"/);
});
