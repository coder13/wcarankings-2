import type { Meta, StoryObj } from "@storybook/react";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import { RankingControls } from "./RankingControls";

const regions = [
  { key: "world", scope: "world" as const, regionId: "", label: "World" },
  ...FALLBACK_CONTINENTS.slice(0, 2).map((region) => ({
    key: `continent:${region.id}`,
    scope: "continent" as const,
    regionId: region.id,
    label: region.name.replace(/^_/, ""),
  })),
  ...FALLBACK_COUNTRIES.slice(0, 2).map((region) => ({
    key: `country:${region.id}`,
    scope: "country" as const,
    regionId: region.id,
    label: region.name,
  })),
];

const meta = {
  title: "Core UI/Molecules/RankingControls",
  component: RankingControls,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    eventId: "333",
    rankingType: "single",
    gender: [],
    regions,
    regionSelection: { scope: "world", regionId: "" },
    onEventChange: () => undefined,
    onRankingTypeChange: () => undefined,
    onGenderChange: () => undefined,
    onRegionChange: () => undefined,
  },
} satisfies Meta<typeof RankingControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Average: Story = { args: { rankingType: "average" } };
export const MultiBlind: Story = { args: { eventId: "333mbf" } };
