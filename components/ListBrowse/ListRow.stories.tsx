import type { Meta, StoryObj } from "@storybook/react";
import { ListRow } from "./ListRow";

const meta = {
  title: "Lists/ListRow",
  component: ListRow,
  parameters: { layout: "fullscreen" },
  args: { list: { systemAlias: "max", publicId: null, name: "Max", memberCount: 685, kind: "system", createdBy: null } },
} satisfies Meta<typeof ListRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const System: Story = {};
export const UserCreated: Story = { args: { list: { systemAlias: null, publicId: "abc123", name: "Local cubers", memberCount: 42, kind: "user", createdBy: "Cailyn Sinclair" } } };
