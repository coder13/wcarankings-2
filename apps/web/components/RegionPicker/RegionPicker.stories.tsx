import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import type { RegionOption, RegionSelection } from "../RankingsExplorer/types";
import { RegionPicker } from "./RegionPicker";

const options: RegionOption[] = [
  { key: "world", scope: "world", regionId: "", label: "World" },
  ...FALLBACK_CONTINENTS.slice(0, 3).map((region) => ({
    key: `continent:${region.id}`,
    scope: "continent" as const,
    regionId: region.id,
    label: region.name.replace(/^_/, ""),
  })),
  ...FALLBACK_COUNTRIES.slice(0, 5).map((region) => ({
    key: `country:${region.id}`,
    scope: "country" as const,
    regionId: region.id,
    label: region.name,
  })),
];

function InteractiveRegionPicker() {
  const [selected, setSelected] = useState<RegionSelection>(options[0]);
  return <RegionPicker options={options} selected={selected} onChange={setSelected} />;
}

const meta = {
  title: "Core UI/Atoms/RegionPicker",
  component: RegionPicker,
  parameters: { layout: "centered" },
  args: {
    options,
    selected: options[0],
    onChange: () => undefined,
  },
  render: () => <InteractiveRegionPicker />,
} satisfies Meta<typeof RegionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
