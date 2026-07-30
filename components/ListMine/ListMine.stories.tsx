import type { Meta, StoryObj } from "@storybook/react";
import { ListMine } from "./ListMine";

const lists = [
  { id: 1, publicId: "7K3M9Q2D", systemAlias: null, kind: "user" as const, name: "Pacific Northwest cubers", slug: "pacific-northwest-cubers", description: null, visibility: "public" as const, joinPolicy: "open" as const, memberCount: 42, membershipVersion: 1, systemDefinitionVersion: null, owner: { id: 1, name: "Cailyn Sinclair", wcaId: "2016TEST01" }, createdAt: "2026-07-29", updatedAt: "2026-07-29" },
  { id: 2, publicId: "6N4B8H1T", systemAlias: null, kind: "user" as const, name: "Practice group", slug: "practice-group", description: null, visibility: "private" as const, joinPolicy: "closed" as const, memberCount: 8, membershipVersion: 1, systemDefinitionVersion: null, owner: { id: 1, name: "Cailyn Sinclair", wcaId: "2016TEST01" }, createdAt: "2026-07-29", updatedAt: "2026-07-29" },
];

const meta = { title: "Lists/ListMine", component: ListMine, parameters: { layout: "fullscreen" }, args: { lists } } satisfies Meta<typeof ListMine>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { lists: [] } };
