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
] as const satisfies readonly EventPickerOption[];
