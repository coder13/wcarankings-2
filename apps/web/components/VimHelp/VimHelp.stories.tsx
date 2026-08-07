import type { Meta, StoryObj } from "@storybook/react";
import { VimHelp } from "./VimHelp";

const meta = {
  title: "Core UI/Molecules/VimHelp",
  component: VimHelp,
  parameters: { layout: "fullscreen" },
  args: { onClose: () => undefined },
} satisfies Meta<typeof VimHelp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
