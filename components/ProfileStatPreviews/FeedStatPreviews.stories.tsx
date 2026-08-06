import type { Meta, StoryObj } from "@storybook/react";
import type { FeedStatPreview } from "@/services/feeds/stat-previews";
import type { RankingEntry } from "../RankingsExplorer/types";
import { FeedStatPreviews } from "./FeedStatPreviews";

const competitionNames = [
  "Singapore Double or Nothing Parity Mayhem 2026",
  "Singapore Aug Even 2026",
  "Singapore Aug Even 2026",
  "NUS Mega Challenge 2026",
  "Singapore Aug Even 2026",
];

const entries: RankingEntry[] = competitionNames.map(
  (competitionName, index) => ({
    rank: index + 1,
    subRank: index + 1,
    personId: "2022KAOE01",
    personName: "Emmanuel Kao",
    countryName: "Singapore",
    countryIso2: "SG",
    best: 6874 + index * 64,
    formattedValue: ["1:08.74", "1:09.38", "1:10.01", "1:10.98", "1:11.02"][
      index
    ],
    competitionId: index === 0 ? "new-result" : "singapore-aug-even",
    competitionName,
    recordBadges: index === 0 ? ["NR"] : [],
  }),
);

const preview: FeedStatPreview = {
  id: "333-single-country-sg-2026",
  eventId: "333",
  eventName: "3x3x3 Cube",
  resultType: "single",
  kind: "person",
  region: { scope: "country", regionId: "Singapore", name: "Singapore" },
  gender: null,
  year: 2026,
  title: "3x3x3 Cube · Single · Singapore · Everyone · 2026",
  exploreUrl: "/rankings?eventId=333&result=single&region=Singapore&year=2026",
  entries,
  highlightedCompetitionIds: ["singapore-aug-even"],
  interestingEntityId: "2022KAOE01",
  interestingResultId: 2,
};

const meta = {
  title: "Core UI/Organisms/FeedStatPreviews",
  component: FeedStatPreviews,
  parameters: { layout: "fullscreen" },
  args: {
    initialPreviews: [preview],
    initialCursor: null,
  },
} satisfies Meta<typeof FeedStatPreviews>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoAdjacentHighlights: Story = {};
