import type { Meta, StoryObj } from "@storybook/react";
import { ListCreate } from "./ListCreate";

const meta = {
  title: "Lists/ListCreate",
  component: ListCreate,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ListCreate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = { args: { signedIn: true } };
export const SignedOut: Story = { args: { signedIn: false } };
