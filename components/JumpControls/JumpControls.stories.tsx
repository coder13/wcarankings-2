import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import type { RankingEntry, RegionOption } from "../RankingsExplorer/types";
import { RankingsJumpRail, RankingsPagerRail } from "./JumpControls";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const matches: RankingEntry[] = [
  {
    rank: 1,
    subRank: 1,
    personId: "2017PARK03",
    personName: "Max Park",
    countryName: "United States",
    countryIso2: "US",
    best: 311,
    competitionId: "storybook-open-2026",
    competitionName: "Storybook Open 2026",
    recordBadges: [],
  },
];

const regions: RegionOption[] = [
  { key: "world", scope: "world", regionId: "", label: "World" },
  { key: "country:US", scope: "country", regionId: "US", label: "United States" },
];

function InteractiveTopRail() {
  const [eventId, setEventId] =
    useState<(typeof WCA_EVENTS)[number]["id"]>("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState({ scope: "world" as const, regionId: "" });
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;

  return (
    <JumpControlsVisibility visible>
      <RankingsJumpRail
        event={event}
        onEventChange={setEventId}
        rankingType={rankingType}
        onRankingTypeChange={setRankingType}
        regions={regions}
        regionSelection={regionSelection}
        onRegionChange={setRegionSelection}
        findOpen={findOpen}
        findQuery={query}
        findError=""
        findLoading={false}
        findPending={false}
        findMatches={matches}
        findIndex={0}
        onSearchOpen={() => setFindOpen(true)}
        onSearchClose={() => {
          setFindOpen(false);
          setQuery("");
        }}
        onSearchQueryChange={setQuery}
        onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>
  );
}

const meta = {
  title: "Rankings/JumpControls",
  component: RankingsPagerRail,
  parameters: { layout: "fullscreen" },
  args: {
    upArmed: false,
    downArmed: false,
    currentPosition: 100,
    total: 10_000,
    onJumpUp: () => undefined,
    onJumpDown: () => undefined,
    searchActive: false,
    onSearchPrevious: () => undefined,
    onSearchNext: () => undefined,
  },
} satisfies Meta<typeof RankingsPagerRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  render: () => <InteractiveTopRail />,
};

export const Bottom: Story = {
  args: { downArmed: true },
  render: (args) => (
    <JumpControlsVisibility visible>
      <RankingsPagerRail {...args} />
    </JumpControlsVisibility>
  ),
};
