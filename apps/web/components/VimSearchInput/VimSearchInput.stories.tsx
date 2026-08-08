import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { VimSearchInput } from "./VimSearchInput";

const match = {
  rank: 18,
  subRank: 18,
  personId: "2024WALK01",
  personName: "Cailyn Sinclair",
  countryName: "United States",
  countryIso2: "US",
  best: 1234,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
  recordBadges: [],
};

function InteractiveVimSearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("/Cailyn");
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <VimSearchInput
      state={{ inputRef, mode: false, command: value, helpOpen }}
      search={{
        active: true,
        query: "Cailyn",
        loading: false,
        pending: false,
        activeMatch: match,
        matches: [match],
      }}
      actions={{
        changeCommand: setValue,
        closeSearch: () => undefined,
        cycleSearch: () => undefined,
        toggleHelp: () => setHelpOpen((open) => !open),
      }}
    />
  );
}

const meta = {
  title: "Core UI/Atoms/VimSearchInput",
  component: VimSearchInput,
  parameters: { layout: "fullscreen" },
  args: {
    state: {
      inputRef: { current: null },
      mode: false,
      command: "/Cailyn",
      helpOpen: false,
    },
    search: {
      active: true,
      query: "Cailyn",
      loading: false,
      pending: false,
      activeMatch: match,
      matches: [match],
    },
    actions: {
      changeCommand: () => undefined,
      closeSearch: () => undefined,
      cycleSearch: () => undefined,
      toggleHelp: () => undefined,
    },
  },
  render: () => <InteractiveVimSearchInput />,
} satisfies Meta<typeof VimSearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSearch: Story = {};
