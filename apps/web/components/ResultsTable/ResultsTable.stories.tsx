import type { Meta, StoryObj } from "@storybook/react";
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

const meta = {
  title: "Core UI/Molecules/ResultsTable",
  component: ResultsTable,
  parameters: { layout: "fullscreen" },
  args: {
    data: {
      items,
      eventId: "333",
      rankingType: "single",
    },
    virtualization: {
      totalHeight: entries.length * 65,
      listOffset: 0,
    },
    search: { highlightedPersonId: "" },
    interaction: {
      onRowNavigate: () => undefined,
      onToggleExpanded: () => undefined,
    },
  },
} satisfies Meta<typeof ResultsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Highlighted: Story = {
  args: { search: { highlightedPersonId: "2024TIED02" } },
};
