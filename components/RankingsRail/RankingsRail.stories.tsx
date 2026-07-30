import type { Meta, StoryObj } from "@storybook/react";
import { useState, type CSSProperties } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import { ALL_EVENT_RANKING_OPTIONS } from "../EventPicker/allEventRankingOptions";
import type { EventPickerOption } from "../EventPicker/EventPicker";
import type { RankingEntry, RegionOption } from "../RankingsExplorer/types";
import { ListBrowseControlsRail, ListBrowsePagerRail, RankingsControlsRail, RankingsPagerRail } from "./RankingsRail";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";

const eventOptions = WCA_EVENTS satisfies readonly EventPickerOption[];
const allEventOptions = [...WCA_EVENTS, ...ALL_EVENT_RANKING_OPTIONS] as const;
type RailEvent = (typeof allEventOptions)[number];

const matches: RankingEntry[] = [{ rank: 1, subRank: 1, personId: "2017PARK03", personName: "Max Park", countryName: "United States", countryIso2: "US", best: 311, competitionId: "storybook-open-2026", competitionName: "Storybook Open 2026", recordBadges: [] }];
const regions: RegionOption[] = [
  { key: "world", scope: "world", regionId: "", label: "World" },
  { key: "country:US", scope: "country", regionId: "US", label: "United States" },
];

function TopRail({ scrollProgress = 0 }: { scrollProgress?: number }) {
  const [eventId, setEventId] = useState<RailEvent["id"]>("333");
  const [rankingType, setRankingType] = useState<"single" | "average">("single");
  const [regionSelection, setRegionSelection] = useState({ scope: "world" as const, regionId: "" });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const event = allEventOptions.find((candidate) => candidate.id === eventId)!;
  const isAllEventRanking = ALL_EVENT_RANKING_OPTIONS.some((option) => option.id === event.id);

  return <div style={{ "--rail-scroll-progress": scrollProgress } as CSSProperties}>
    <JumpControlsVisibility visible>
      <RankingsControlsRail
      event={event}
      eventOptions={eventOptions}
      additionalEventOptions={ALL_EVENT_RANKING_OPTIONS}
      onEventChange={setEventId}
      rankingType={rankingType}
      onRankingTypeChange={setRankingType}
      gender={[]}
      onGenderChange={() => undefined}
      regions={regions}
      regionSelection={regionSelection}
      onRegionChange={setRegionSelection}
      compactResultType={scrollProgress >= 1}
      findOpen={searchOpen}
      findQuery={query}
      findError=""
      findLoading={false}
      findPending={false}
      findMatches={matches}
      findIndex={0}
      onSearchOpen={() => setSearchOpen(true)}
      onSearchClose={() => setSearchOpen(false)}
      onSearchQueryChange={setQuery}
      onSearchCycle={() => undefined}
      />
      <p style={{ color: "var(--text-muted)", marginTop: "2rem" }}>
        {isAllEventRanking ? `All-person rankings · ${event.name}` : `Event rankings · ${event.name}`}
      </p>
    </JumpControlsVisibility>
  </div>;
}

function TopRailStory({ scrollProgress = 0 }: { scrollProgress?: number }) {
  return <div style={{ minHeight: "18rem", padding: "3rem" }}><TopRail scrollProgress={scrollProgress} /></div>;
}

function ScrollTransitionStory() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const transitionDistance = 132;

  return (
    <div
      onScroll={(event) => setScrollProgress(Math.min(1, event.currentTarget.scrollTop / transitionDistance))}
      style={{ height: "24rem", overflowY: "auto", padding: "1.5rem", background: "var(--surface-muted)" }}
    >
      <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "1.5rem 0", background: "var(--surface-muted)" }}>
        <TopRail scrollProgress={scrollProgress} />
        <output style={{ display: "block", marginTop: "1rem", color: "var(--text-muted)" }}>
          Scroll {Math.round(scrollProgress * transitionDistance)}px / {transitionDistance}px
        </output>
      </div>
      <div style={{ height: "42rem", paddingTop: "1rem", color: "var(--text-muted)" }}>
        Scroll this panel to drive the same 0–132px rail transition used on the rankings page.
      </div>
    </div>
  );
}

const meta = {
  title: "Core UI/Molecules/RankingsRail",
  component: RankingsControlsRail,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof RankingsControlsRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TopOpen: Story = { render: () => <TopRailStory /> };

export const TopCollapsed: Story = {
  render: () => <TopRailStory scrollProgress={1} />,
};

export const TopScrollTransition: Story = {
  render: () => <ScrollTransitionStory />,
};

export const Bottom: Story = {
  render: () => (
    <div style={{ padding: "3rem" }}>
      <JumpControlsVisibility visible>
        <RankingsPagerRail
          upArmed={false}
          downArmed={false}
          currentPosition={5_001}
          total={10_000}
          onJumpUp={() => undefined}
          onJumpDown={() => undefined}
          searchActive={false}
          onSearchPrevious={() => undefined}
          onSearchNext={() => undefined}
        />
      </JumpControlsVisibility>
    </div>
  ),
};

export const ListBrowseControls: Story = { render: () => <ListBrowseControlsRail query="" onQueryChange={() => undefined} /> };
export const ListBrowsePager: Story = { render: () => <ListBrowsePagerRail onJumpUp={() => undefined} onJumpDown={() => undefined} /> };
