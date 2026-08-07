import type { Meta, StoryObj } from "@storybook/react";
import { GoogleAnalytics } from "./GoogleAnalytics";

const meta = {
  title: "App/GoogleAnalytics",
  component: GoogleAnalytics,
  parameters: {
    docs: {
      description: {
        component: "Non-visual navigation tracking. This story verifies it mounts in the shared application environment.",
      },
    },
  },
} satisfies Meta<typeof GoogleAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
