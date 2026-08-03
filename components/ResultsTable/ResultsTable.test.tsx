import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import type { RankingEntry } from "../RankingsExplorer/types";
import type { VirtualRankingItem } from "../RankingsExplorer/useVirtualRankings";
import { ResultsTable } from "./ResultsTable";

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

const items: VirtualRankingItem[] = entries.map((entry, index) => ({
  index,
  globalIndex: index,
  key: index,
  start: index * 65,
  end: (index + 1) * 65,
  size: 65,
  lane: 0,
  entry,
  rankIsDuplicate: index > 0 && entries[index - 1].rank === entry.rank,
  expanded: false,
  expandedContentHeight: 0,
  expansionProgress: 0,
}));

test("renders rows and highlights tied results", () => {
  const markup = renderWithProviders(
    <ResultsTable
      data={{ items, eventId: "333", rankingType: "single" }}
      virtualization={{ totalHeight: 130, listOffset: 0 }}
      search={{ highlightedPersonId: "2024TIED02" }}
      interaction={{
        onRowNavigate: () => undefined,
        onToggleExpanded: () => undefined,
      }}
    />,
  );
  assert.match(markup, /Fast Solver/);
  assert.match(markup, /Tied Solver/);
  assert.match(markup, /rank--duplicate/);
});

test("renders cached ranking items without a loading replacement", () => {
  const markup = renderWithProviders(
    <ResultsTable
      data={{ items, eventId: "333", rankingType: "single" }}
      virtualization={{ totalHeight: 130, listOffset: 0 }}
      search={{ highlightedPersonId: "" }}
      interaction={{
        onRowNavigate: () => undefined,
        onToggleExpanded: () => undefined,
      }}
    />,
  );

  assert.match(markup, /Fast Solver/);
  assert.doesNotMatch(markup, /Loading rankings/);
});

test("keeps row striping tied to the global ranking index", () => {
  const displacedItem = {
    ...items[0],
    key: 101,
    globalIndex: 101,
  };
  const markup = renderWithProviders(
    <ResultsTable
      data={{
        items: [displacedItem],
        eventId: "333",
        rankingType: "single",
      }}
      virtualization={{ totalHeight: 65, listOffset: 0 }}
      search={{ highlightedPersonId: "" }}
      interaction={{
        onRowNavigate: () => undefined,
        onToggleExpanded: () => undefined,
      }}
    />,
  );

  assert.match(markup, /class="row row--alternate"/);
});

test("renders unloaded rankings as empty striped rows", () => {
  const loadingItems = items.map((item, index) => ({
    ...item,
    key: 100 + index,
    globalIndex: 100 + index,
    entry: null,
  }));
  const markup = renderWithProviders(
    <ResultsTable
      data={{
        items: loadingItems,
        eventId: "333",
        rankingType: "single",
      }}
      virtualization={{ totalHeight: 130, listOffset: 0 }}
      search={{ highlightedPersonId: "" }}
      interaction={{
        onRowNavigate: () => undefined,
        onToggleExpanded: () => undefined,
      }}
    />,
  );

  assert.doesNotMatch(markup, /Loading rankings/);
  assert.match(markup, /class="row row--loading"/);
  assert.match(markup, /class="row row--loading row--alternate"/);
});
