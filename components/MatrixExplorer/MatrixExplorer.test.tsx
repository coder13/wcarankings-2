import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MatrixExplorer } from "./MatrixExplorer";

test("keeps matrix views focused on the overall ranking", () => {
  const markup = renderToStaticMarkup(
    <MatrixExplorer
      initialData={{
        entries: [{
          rank: 1,
          personId: "2017PARK03",
          personName: "Max Park",
          countryName: "United States",
          countryIso2: "US",
          overall: 42,
          coverage: 1,
          eventValues: { "333": { rank: 1, kinch: 100 } },
        }],
        total: 1,
        fetchedAt: null,
        supportedEventIds: ["333"],
        coveragePolicy: "Ranked in all 1 supported event",
      }}
      initialView="sor"
      initialRankingType="single"
      initialRegionSelection={{ scope: "world", regionId: "" }}
      initialSearch=""
      initialRegions={{ continents: [], countries: [] }}
    />,
  );

  assert.match(markup, /Overall SOR/);
  assert.match(markup, /class="matrixOverall">42/);
  assert.match(markup, /class="matrixEvent"/);
  assert.doesNotMatch(markup, />Coverage</);
  assert.match(markup, /findBar findBar--header/);
  assert.match(markup, /Jump to end/);
});
