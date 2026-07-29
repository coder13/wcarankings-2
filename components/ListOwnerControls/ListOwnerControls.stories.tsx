import type { Meta, StoryObj } from "@storybook/react";
import { ListCreateTrigger, ListOwnerControls } from "./ListOwnerControls";

const meta = { title: "Lists/ListOwnerControls", component: ListOwnerControls, args: { listId: "7K3M9Q2D", initialVisibility: "public" } } satisfies Meta<typeof ListOwnerControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OwnerActions: Story = {};
export const CreateList: StoryObj<typeof ListCreateTrigger> = { render: () => <ListCreateTrigger /> };
