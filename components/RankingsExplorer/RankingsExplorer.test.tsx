import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  centeredRowScrollTop,
  areRankingWindowsContiguous,
  getSearchScrollDirection,
  orderSearchMatches,
  RankingsExplorer,
} from "./RankingsExplorer";
import type { RankingEntry } from "./types";

const rankingEntry: RankingEntry = {
  rank: 1,
  subRank: 1,
  personId: "2024AVERY01",
  personName: "Avery Chen",
  countryName: "United States",
  countryIso2: "US",
  best: 512,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
  recordBadges: ["NR"],
};

test("ignores empty search-result slots", () => {
  const matches = new Array<typeof rankingEntry | undefined>(1);
  matches.push(rankingEntry);

  assert.deepEqual(orderSearchMatches(matches), [rankingEntry]);
});

test("centers search targets in the viewport", () => {
  assert.equal(centeredRowScrollTop(1_000, 800), 632.725);
  assert.equal(centeredRowScrollTop(100, 800), 0);
});

test("uses the actual rank direction when search results wrap around", () => {
  assert.equal(
    getSearchScrollDirection({ subRank: 900 }, { subRank: 100 }, 1),
    -1
  );
  assert.equal(
    getSearchScrollDirection({ subRank: 100 }, { subRank: 900 }, -1),
    1
  );
});

test("only appends ranking windows with consecutive sub-ranks", () => {
  assert.equal(
    areRankingWindowsContiguous(
      [{ subRank: 1 }, { subRank: 50 }],
      [{ subRank: 51 }, { subRank: 100 }],
      1
    ),
    true
  );
  assert.equal(
    areRankingWindowsContiguous(
      [{ subRank: 51 }, { subRank: 100 }],
      [{ subRank: 1 }, { subRank: 50 }],
      -1
    ),
    true
  );
  assert.equal(
    areRankingWindowsContiguous(
      [{ subRank: 1 }, { subRank: 50 }],
      [{ subRank: 5001 }, { subRank: 5050 }],
      1
    ),
    false
  );
});

test("renders the rankings shell with extracted components", () => {
  const markup = renderToStaticMarkup(
    <RankingsExplorer
      initialData={{
        entries: [
          rankingEntry,
        ],
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        startRank: 1,
        startPosition: 0,
        lastRank: 1,
        total: 1,
        fetchedAt: null,
        searchMatches: [],
        initialMatchPersonId: "",
      }}
      initialRegions={{ continents: [], countries: [] }}
    />,
  );
  assert.match(markup, /WCA Rankings/);
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
});
