import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchInputs } from "./SearchInputs";

const matches = [
  {
    rank: 12,
    subRank: 12,
    personId: "2024WALK01",
    personName: "Cailyn Sinclair",
    countryName: "United States",
    countryIso2: "US",
    best: 1234,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: [],
  },
];

function InteractiveSearchInputs({
  initiallyOpen = true,
}: {
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("Cailyn");
  return (
    <SearchInputs
      findOpen={open}
      findQuery={query}
      findError=""
      findLoading={false}
      findPending={false}
      findMatches={matches}
      findIndex={0}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onQueryChange={setQuery}
      onCycle={() => undefined}
    />
  );
}

const meta = {
  title: "Core UI/Atoms/SearchInputs",
  component: SearchInputs,
  parameters: { layout: "centered" },
  args: {
    findOpen: true,
    findQuery: "Cailyn",
    findError: "",
    findLoading: false,
    findPending: false,
    findMatches: matches,
    findIndex: 0,
    onOpen: () => undefined,
    onClose: () => undefined,
    onQueryChange: () => undefined,
    onCycle: () => undefined,
  },
  render: () => <InteractiveSearchInputs />,
} satisfies Meta<typeof SearchInputs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Closed: Story = {
  render: () => <InteractiveSearchInputs initiallyOpen={false} />,
};
