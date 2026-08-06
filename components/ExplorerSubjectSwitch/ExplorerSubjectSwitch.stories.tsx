import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  ExplorerSubjectSwitch,
  type ExplorerSubject,
} from "./ExplorerSubjectSwitch";

const description: Record<ExplorerSubject, string> = {
  people: "All-person rankings such as Sum of Ranks and SoR Kinch.",
  results: "Official individual results for the selected event and result type.",
  competitions: "Competition bests for the selected event and result type.",
  cities: "City rankings for the selected event and result type.",
};

function InteractiveSwitch({
  variant = "segmented",
}: {
  variant?: "segmented" | "select";
}) {
  const [subject, setSubject] = useState<ExplorerSubject>("people");
  return (
    <div style={{ display: "grid", gap: "1rem", minWidth: "min(100%, 30rem)" }}>
      <ExplorerSubjectSwitch subject={subject} onChange={(nextSubject) => {
        if (nextSubject !== "lists") setSubject(nextSubject);
      }} variant={variant} />
      <p style={{ margin: 0, color: "var(--text-muted)" }}>{description[subject]}</p>
    </div>
  );
}

const meta = {
  title: "Core UI/Atoms/ExplorerSubjectSwitch",
  component: InteractiveSwitch,
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Segmented: Story = {
  render: () => <InteractiveSwitch variant="segmented" />,
};

export const CompactSelect: Story = {
  render: () => <InteractiveSwitch variant="select" />,
};

export const HeaderNavigation: Story = {
  render: () => <ExplorerSubjectSwitch subject="people" onChange={() => undefined} variant="text" />,
};
