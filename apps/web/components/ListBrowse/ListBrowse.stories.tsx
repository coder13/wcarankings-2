import type { Meta, StoryObj } from "@storybook/react";
import { ListBrowse } from "./ListBrowse";

const lists = [
  { systemAlias: "max", slug: "max", publicId: null, name: "Max", memberCount: 685, kind: "system" as const, createdBy: null },
  { systemAlias: "board", slug: "board", publicId: null, name: "Board", memberCount: 5, kind: "system" as const, createdBy: null },
  { systemAlias: null, slug: "local-cubers", publicId: "abc123", name: "Local cubers", memberCount: 42, kind: "user" as const, createdBy: "Cailyn Sinclair" },
];

const meta = { title: "Lists/ListBrowse", component: ListBrowse, parameters: { layout: "fullscreen" }, args: { lists } } satisfies Meta<typeof ListBrowse>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { lists: [] } };
export const MultiplePages: Story = {
  args: {
    lists: Array.from({ length: 51 }, (_, index) => ({
      systemAlias: null,
      slug: `community-list-${index + 1}`,
      publicId: `list-${index}`,
      name: `Community list ${index + 1}`,
      memberCount: index + 1,
      kind: "user" as const,
      createdBy: "Cailyn Sinclair",
    })),
  },
};
