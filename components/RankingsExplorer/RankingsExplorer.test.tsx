import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { EXPLORER_SUBJECTS } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import {
  centeredRowScrollTop,
  competitionRankingPath,
  getSearchScrollDirection,
  orderSearchMatches,
  pageStartForViewportSubRank,
  RankingsExplorer,
  shouldFallbackToFirstPage,
  subjectPath,
} from "./RankingsExplorer";

const rankingEntry = {
  rank: 1,
  subRank: 1,
  personId: "2024AVERY01",
  personName: "Avery Chen",
  countryName: "United States",
  countryIso2: "US",
  best: 512,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
  recordBadges: ["NR"] as const,
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

test("keeps event and result-type changes on the current page", () => {
  assert.equal(pageStartForViewportSubRank(1), 1);
  assert.equal(pageStartForViewportSubRank(50), 1);
  assert.equal(pageStartForViewportSubRank(51), 51);
  assert.equal(pageStartForViewportSubRank(98), 51);
});

test("falls back to the first page only when a preserved page is absent", () => {
  assert.equal(shouldFallbackToFirstPage(51, 0), true);
  assert.equal(shouldFallbackToFirstPage(51, 1), false);
  assert.equal(shouldFallbackToFirstPage(1, 0), false);
});

test("gives each non-default subject and competition ranking a page", () => {
  assert.equal(subjectPath("people"), "/");
  assert.equal(subjectPath("results"), "/results");
  assert.equal(subjectPath("competitions"), "/competitions/best-result");
  assert.equal(competitionRankingPath("best-result"), "/competitions/best-result");
  assert.equal(competitionRankingPath("podiums"), "/competitions/podiums");
  assert.equal(competitionRankingPath("competitor-count"), "/competitions/competitor-count");
  assert.equal(competitionRankingPath("latitude"), "/competitions/latitude");
});

test("exposes active person, result, and competition ranking subjects", () => {
  assert.deepEqual(
    EXPLORER_SUBJECTS.map(({ id }) => id),
    ["people", "results", "competitions"],
  );
});

test("renders the rankings shell with extracted components", () => {
  const markup = renderToStaticMarkup(
    <AppRouterContext.Provider value={{
      back() {},
      forward() {},
      refresh() {},
      hmrRefresh() {},
      push() {},
      replace() {},
      prefetch() {},
    }}>
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
          searchMatches: [],
          initialMatchPersonId: "",
        }}
        initialRegions={{ continents: [], countries: [] }}
        rankingSource={{ kind: "saved", listId: "7K3M9Q2D", listName: "Pacific Northwest cubers" }}
      />
    </AppRouterContext.Provider>,
  );
  assert.match(markup, /WCA Rankings/);
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
  assert.doesNotMatch(markup, /Jump to top/);
});
