import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./AppHeader";

const meta = {
  title: "Core UI/Organisms/AppHeader",
  component: AppHeader,
  parameters: { layout: "fullscreen" },
  args: { children: <span>Lists</span> },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithListName: Story = { args: { children: <><span>Lists</span><span className="listRankingName">Max</span></> } };
