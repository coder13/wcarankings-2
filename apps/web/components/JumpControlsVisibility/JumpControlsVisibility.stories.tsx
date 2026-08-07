import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { JumpControlsVisibility } from "./JumpControlsVisibility";

function VisibilityDemo() {
  const [progress, setProgress] = useState(1);
  return <div style={{ display: "grid", minWidth: "20rem", gap: "1rem", padding: "2rem" }}>
    <label>
      Visibility progress: {Math.round(progress * 100)}%
      <input type="range" min="0" max="1" step="0.01" value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
    </label>
    <JumpControlsVisibility progress={progress}>
      <button type="button">Visible rail content</button>
    </JumpControlsVisibility>
  </div>;
}

const meta = {
  title: "Core UI/Molecules/JumpControlsVisibility",
  component: VisibilityDemo,
  parameters: { layout: "centered" },
  render: () => <VisibilityDemo />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Transition: Story = {};
