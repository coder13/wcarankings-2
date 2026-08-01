import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import { ALL_EVENT_RANKING_OPTIONS } from "./allEventRankingOptions";
import { EventPicker, type EventPickerOption } from "./EventPicker";

const allOptions = [...WCA_EVENTS, ...ALL_EVENT_RANKING_OPTIONS] as const satisfies readonly EventPickerOption[];
type PickerOption = (typeof allOptions)[number];

function InteractiveEventPicker() {
  const [eventId, setEventId] = useState<PickerOption["id"]>("333");
  const event = allOptions.find((option) => option.id === eventId)!;

  return (
    <div style={{ position: "relative", width: "44px" }}>
      <EventPicker
        event={event}
        options={WCA_EVENTS}
        additionalOptions={ALL_EVENT_RANKING_OPTIONS}
        onChange={setEventId}
      />
    </div>
  );
}

const meta = {
  title: "Core UI/Atoms/EventPicker",
  component: InteractiveEventPicker,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "20rem", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAllEventRankings: Story = {
  render: () => <InteractiveEventPicker />,
};
