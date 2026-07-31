import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RankingEntry } from "../RankingsExplorer/types";
import { getRenderedRowIdentity, ResultsTable } from "./ResultsTable";

test("uses entry identity for row replacement but not for empty virtual slots", () => {
  assert.equal(getRenderedRowIdentity(entries[0], 0, true), "2024FAST01");
  assert.equal(getRenderedRowIdentity(null, 3, true), "placeholder:3:more");
  assert.equal(getRenderedRowIdentity(null, 3, false), "placeholder:3:end");
});

const entries: RankingEntry[] = [
  {
    rank: 1,
    subRank: 1,
    personId: "2024FAST01",
    personName: "Fast Solver",
    countryName: "United States",
    countryIso2: "US",
    best: 512,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: ["WR"],
  },
  {
    rank: 1,
    subRank: 2,
    personId: "2024TIED01",
    personName: "Tied Solver",
    countryName: "Canada",
    countryIso2: "CA",
    best: 512,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: [],
  },
];

test("renders rows and highlights tied results", () => {
  const markup = renderToStaticMarkup(
    <ResultsTable
      entries={entries}
      renderedRows={entries.map((_, index) => ({ index, key: index, start: index * 65.45 }))}
      renderedListHeight={123.2}
      listOffset={0}
      eventId="333"
      rankingType="single"
      loading={false}
      showLoading={false}
      preserveListDuringLoad={false}
      hasMore
      loadingMore={false}
      highlightedPersonId="2024TIED02"
      measureElement={() => undefined}
      onRowNavigate={() => undefined}
    />,
  );
  assert.match(markup, /Fast Solver/);
  assert.match(markup, /Tied Solver/);
  assert.match(markup, /rank--duplicate/);
});

test("keeps already rendered rankings visible while refreshing", () => {
  const markup = renderToStaticMarkup(
    <ResultsTable
      entries={entries}
      renderedRows={entries.map((_, index) => ({ index, key: index, start: index * 65.45 }))}
      renderedListHeight={123.2}
      listOffset={0}
      eventId="333"
      rankingType="single"
      loading
      showLoading
      preserveListDuringLoad={false}
      hasMore
      loadingMore={false}
      highlightedPersonId=""
      measureElement={() => undefined}
      onRowNavigate={() => undefined}
    />,
  );

  assert.match(markup, /Fast Solver/);
  assert.doesNotMatch(markup, /Loading rankings/);
});
