import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import type { RankingEntry, RegionOption, RegionSelection } from "../RankingsExplorer/types";
import { JumpDownControls, MatrixJumpRail, RankingsJumpRail } from "./JumpControls";
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

function InteractiveRankingsRail() {
  const [eventId, setEventId] =
    useState<(typeof WCA_EVENTS)[number]["id"]>("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ scope: "world", regionId: "" });
  const [query, setQuery] = useState("");
  const event = WCA_EVENTS.find((candidate) => candidate.id === eventId)!;

  return (
    <JumpControlsVisibility visible>
      <RankingsJumpRail
      armed
      currentPosition={1}
      onJump={() => undefined}
      event={event}
      onEventChange={setEventId}
      rankingType={rankingType}
      onRankingTypeChange={setRankingType}
      regions={regions}
      regionSelection={regionSelection}
      onRegionChange={setRegionSelection}
      findQuery={query}
      findError=""
      findLoading={false}
      findPending={false}
      findMatchCount={matches.length}
      findIndex={0}
      onSearchOpen={() => undefined}
      onSearchClose={() => {
        setQuery("");
      }}
      onSearchQueryChange={setQuery}
      onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>
  );
}

function InteractiveMatrixRail() {
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({ scope: "world", regionId: "" });
  const [query, setQuery] = useState("");

  return (
    <JumpControlsVisibility visible>
      <MatrixJumpRail
        armed
        currentPosition={1}
        jumpLabel="Back to top"
        onJump={() => undefined}
        rankingType={rankingType}
        onRankingTypeChange={setRankingType}
        regions={regions}
        regionSelection={regionSelection}
        onRegionChange={setRegionSelection}
        findQuery={query}
        findError=""
        findLoading={false}
        findPending={false}
        findMatchCount={matches.length}
        onSearchOpen={() => undefined}
        onSearchClose={() => setQuery("")}
        onSearchQueryChange={setQuery}
        onSearchCycle={() => undefined}
      />
    </JumpControlsVisibility>
  );
}

const meta = {
  title: "Rankings/JumpControls",
  component: JumpDownControls,
  parameters: { layout: "fullscreen" },
  args: {
    armed: false,
    currentPosition: 100,
    total: 10_000,
    onJump: () => undefined,
    searchActive: false,
    onSearchPrevious: () => undefined,
    onSearchNext: () => undefined,
  },
} satisfies Meta<typeof JumpDownControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RankingsRail: Story = {
  render: () => <InteractiveRankingsRail />,
};

export const MatrixRail: Story = {
  render: () => <InteractiveMatrixRail />,
};

export const Bottom: Story = {
  args: { armed: true },
  render: (args) => (
    <JumpControlsVisibility visible>
      <JumpDownControls {...args} />
    </JumpControlsVisibility>
  ),
};
