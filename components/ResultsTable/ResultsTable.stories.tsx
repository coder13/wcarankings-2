import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { RankingEntry } from "../RankingsExplorer/types";
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
    rank: 2,
    subRank: 2,
    personId: "2024TIED01",
    personName: "Tied Solver",
    countryName: "Canada",
    countryIso2: "CA",
    best: 600,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: ["NR"],
  },
  {
    rank: 2,
    subRank: 3,
    personId: "2024TIED02",
    personName: "Another Solver",
    countryName: "Japan",
    countryIso2: "JP",
    best: 600,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: [],
  },
];

function RearrangingStory() {
  const [reversed, setReversed] = useState(false);
  const orderedEntries = reversed ? [entries[2], entries[0], entries[1]] : entries;

  return (
    <div>
      <button type="button" onClick={() => setReversed((value) => !value)}>
        Rearrange rows
      </button>
      <ResultsTable
        entries={orderedEntries}
        renderedRows={orderedEntries.map((_, index) => ({
          index,
          key: index,
          start: index * 65.45,
        }))}
        renderedListHeight={orderedEntries.length * 65.45}
        listOffset={0}
        eventId="333"
        rankingType="single"
        loading={false}
        showLoading={false}
        preserveListDuringLoad={false}
        hasMore={false}
        loadingMore={false}
        highlightedPersonId=""
        measureElement={() => undefined}
        onRowNavigate={() => undefined}
      />
    </div>
  );
}

const meta = {
  title: "Core UI/Molecules/ResultsTable",
  component: ResultsTable,
  parameters: { layout: "fullscreen" },
  args: {
    entries,
    renderedRows: entries.map((_, index) => ({ index, key: index, start: index * 65.45 })),
    renderedListHeight: entries.length * 65.45,
    listOffset: 0,
    eventId: "333",
    rankingType: "single",
    loading: false,
    showLoading: false,
    preserveListDuringLoad: false,
    hasMore: true,
    loadingMore: false,
    highlightedPersonId: "",
    measureElement: () => undefined,
    onRowNavigate: () => undefined,
  },
} satisfies Meta<typeof ResultsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Rearranging: Story = { render: () => <RearrangingStory /> };
export const Loading: Story = { args: { loading: true } };
export const Highlighted: Story = { args: { highlightedPersonId: "2024TIED02" } };
