import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TextDropdown } from "./TextDropdown";

const options = [
  { value: "persons", label: "Persons" },
  { value: "results", label: "Results" },
  { value: "competitions", label: "Competitions" },
] as const;

function InteractiveTextDropdown() {
  const [value, setValue] = useState<(typeof options)[number]["value"]>("persons");
  return <TextDropdown options={options} value={value} onChange={setValue} ariaLabel="Browse rankings by" />;
}

const meta = {
  title: "Core UI/Atoms/TextDropdown",
  component: InteractiveTextDropdown,
  parameters: { layout: "centered" },
  render: () => <InteractiveTextDropdown />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
