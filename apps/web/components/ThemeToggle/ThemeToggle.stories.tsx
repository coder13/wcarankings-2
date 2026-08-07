import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./ThemeToggle";

const meta = {
  title: "Core UI/Atoms/ThemeToggle",
  component: ThemeToggle,
  parameters: { layout: "centered" },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
