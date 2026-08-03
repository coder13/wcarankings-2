import { SUB_X_333_RANKING_EVENTS } from "@/lib/wca";
import type { EventPickerOption } from "./EventPicker";

export const ALL_EVENT_RANKING_OPTIONS = [
  {
    id: "SOR",
    name: "Sum of Ranks",
    shortName: "Sum of Ranks",
    symbol: "Σ",
  },
  {
    id: "sor-kinch",
    name: "SoR Kinch",
    shortName: "SoR Kinch",
    symbol: "%",
  },
  ...SUB_X_333_RANKING_EVENTS,
] as const satisfies readonly EventPickerOption[];

export type AllEventRankingOption = (typeof ALL_EVENT_RANKING_OPTIONS)[number];

export function isAllEventRankingOption(
  id: string,
): id is AllEventRankingOption["id"] {
  return ALL_EVENT_RANKING_OPTIONS.some((option) => option.id === id);
}
