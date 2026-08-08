import type { Meta, StoryObj } from "@storybook/react";
import ArrowDownIcon from "./arrow-down.svg?react";
import ArrowUpIcon from "./arrow-up.svg?react";
import CloseIcon from "./close.svg?react";
import CompassIcon from "./compass.svg?react";
import SearchIcon from "./search.svg?react";
import SelectChevronIcon from "./select-chevron.svg?react";

const icons = [
  ["Arrow down", ArrowDownIcon],
  ["Arrow up", ArrowUpIcon],
  ["Close", CloseIcon],
  ["Compass", CompassIcon],
  ["Search", SearchIcon],
  ["Select chevron", SelectChevronIcon],
] as const;

function IconGallery() {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(6rem, 1fr))", gap: "1.5rem", padding: "2rem" }}>
    {icons.map(([label, Icon]) => <figure key={label} style={{ display: "grid", justifyItems: "center", gap: ".5rem", margin: 0, color: "var(--text-strong)" }}>
      <Icon style={{ width: "2rem", height: "2rem" }} aria-hidden="true" />
      <figcaption>{label}</figcaption>
    </figure>)}
  </div>;
}

const meta = {
  title: "Core UI/Atoms/Icons",
  component: IconGallery,
  parameters: { layout: "centered" },
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
