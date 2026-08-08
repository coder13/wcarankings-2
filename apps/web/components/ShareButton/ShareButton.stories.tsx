import type { Meta, StoryObj } from "@storybook/react";
import { ShareButton } from "./ShareButton";

const meta = {
  title: "App/ShareButton",
  component: ShareButton,
  args: {
    title: "Favorite cubers",
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ShareButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
