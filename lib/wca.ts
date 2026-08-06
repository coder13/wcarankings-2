export type RankingType = "single" | "average";
export type GenderFilter = "m" | "f" | "o";
export type GenderFilters = readonly GenderFilter[];
export type RegionScope = "world" | "continent" | "country";
export type RecordBadgeCode =
  "WR" | "AfR" | "AsR" | "ER" | "NaR" | "OcR" | "SaR" | "NR";

export const RECORD_BADGE_LABELS: Record<RecordBadgeCode, string> = {
  WR: "World Record",
  AfR: "African Record",
  AsR: "Asian Record",
  ER: "European Record",
  NaR: "North American Record",
  OcR: "Oceanian Record",
  SaR: "South American Record",
  NR: "National Record",
};

export type RankingEntry = {
  resultId?: number;
  rank: number;
  subRank: number;
  personId: string;
  personName: string;
  countryId: string;
  countryName: string;
  countryIso2: string;
  continentId: string;
  best: number;
  competitionId: string;
  competitionName: string;
  recordBadges: RecordBadgeCode[];
};

export const WCA_EVENTS = [
  { id: "333", name: "3x3x3 Cube", shortName: "3x3" },
  { id: "222", name: "2x2x2 Cube", shortName: "2x2" },
  { id: "444", name: "4x4x4 Cube", shortName: "4x4" },
  { id: "555", name: "5x5x5 Cube", shortName: "5x5" },
  { id: "666", name: "6x6x6 Cube", shortName: "6x6" },
  { id: "777", name: "7x7x7 Cube", shortName: "7x7" },
  { id: "333bf", name: "3x3x3 Blindfolded", shortName: "3x3 BLD" },
  { id: "333fm", name: "3x3x3 Fewest Moves", shortName: "FMC" },
  { id: "333oh", name: "3x3x3 One-Handed", shortName: "3x3 OH" },
  { id: "clock", name: "Clock", shortName: "Clock" },
  { id: "minx", name: "Megaminx", shortName: "Megaminx" },
  { id: "pyram", name: "Pyraminx", shortName: "Pyraminx" },
  { id: "skewb", name: "Skewb", shortName: "Skewb" },
  { id: "sq1", name: "Square-1", shortName: "Square-1" },
  { id: "444bf", name: "4x4x4 Blindfolded", shortName: "4x4 BLD" },
  { id: "555bf", name: "5x5x5 Blindfolded", shortName: "5x5 BLD" },
  { id: "333mbf", name: "3x3x3 Multi-Blind", shortName: "Multi-BLD" },
] as const;

export const FALLBACK_CONTINENTS = [
  { id: "_Africa", name: "Africa" },
  { id: "_Asia", name: "Asia" },
  { id: "_Europe", name: "Europe" },
  { id: "_North America", name: "North America" },
  { id: "_Oceania", name: "Oceania" },
  { id: "_South America", name: "South America" },
];

export const FALLBACK_COUNTRIES = [
  { id: "Australia", name: "Australia" },
  { id: "Brazil", name: "Brazil" },
  { id: "Canada", name: "Canada" },
  { id: "China", name: "China" },
  { id: "France", name: "France" },
  { id: "Germany", name: "Germany" },
  { id: "India", name: "India" },
  { id: "Indonesia", name: "Indonesia" },
  { id: "Japan", name: "Japan" },
  { id: "Netherlands", name: "Netherlands" },
  { id: "Philippines", name: "Philippines" },
  { id: "Poland", name: "Poland" },
  { id: "South Korea", name: "South Korea" },
  { id: "Spain", name: "Spain" },
  { id: "United Kingdom", name: "United Kingdom" },
  { id: "USA", name: "United States" },
];

export function isRankingType(value: string | null): value is RankingType {
  return value === "single" || value === "average";
}

export function isGenderFilter(value: string | null): value is GenderFilter {
  return value === "m" || value === "f" || value === "o";
}

export function normalizeGenderFilters(values: readonly GenderFilter[]) {
  const normalized = (["m", "f", "o"] as const).filter((value) =>
    values.includes(value),
  );
  return normalized.length === 3 ? [] : normalized;
}

export function genderFiltersLabel(values: GenderFilters) {
  const normalized = normalizeGenderFilters(values);
  if (normalized.length === 0) return genderLabel(null);
  if (normalized.length === 1) return genderLabel(normalized[0]);
  return normalized.map((value) => value.toUpperCase()).join(", ");
}

export function genderLabel(value: GenderFilter | null) {
  if (value === "m") return "Men";
  if (value === "f") return "Women";
  if (value === "o") return "Other";
  return "All";
}

export function parseRegionQuery(value: string | null): {
  scope: RegionScope;
  regionId: string;
} {
  if (!value || value === "world") return { scope: "world", regionId: "" };
  return value.startsWith("_")
    ? { scope: "continent", regionId: value }
    : { scope: "country", regionId: value };
}

export function isEventId(
  value: string | null,
): value is (typeof WCA_EVENTS)[number]["id"] {
  return WCA_EVENTS.some((event) => event.id === value);
}

export function isRankingEventId(value: string | null) {
  return value === "SOR" || value === "sor-kinch" || isEventId(value);
}

export function isValidRegexPattern(value: string) {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

export function formatWcaResult(
  eventId: string,
  value: number,
  rankingType: RankingType = "single",
) {
  if (eventId === "sor-kinch") {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (value <= 0) return value === -1 ? "DNF" : "—";
  if (eventId === "SOR") return new Intl.NumberFormat().format(value);

  if (eventId === "333fm") {
    return rankingType === "average" ? (value / 100).toFixed(2) : `${value}`;
  }

  if (eventId === "333mbf") {
    const encoded = value.toString().padStart(9, "0");
    const difference = 99 - Number(encoded.slice(0, 2));
    const seconds = Number(encoded.slice(2, 7));
    const missed = Number(encoded.slice(7, 9));
    const solved = difference + missed;
    const attempted = solved + missed;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remaining = seconds % 60;
    const time = hours
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
      : `${minutes}:${remaining.toString().padStart(2, "0")}`;
    return `${solved}/${attempted} ${time}`;
  }

  const totalSeconds = value / 100;
  if (totalSeconds < 60) return totalSeconds.toFixed(2);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0");
  return `${minutes}:${seconds}`;
}

export function flagEmoji(iso2: string) {
  if (!/^[A-Z]{2}$/.test(iso2)) return "🌐";
  return String.fromCodePoint(
    ...[...iso2].map((char) => 127397 + char.charCodeAt(0)),
  );
}

const continentRecordCodes: Record<string, RecordBadgeCode> = {
  _Africa: "AfR",
  _Asia: "AsR",
  _Europe: "ER",
  "_North America": "NaR",
  _Oceania: "OcR",
  "_South America": "SaR",
};

export function getRecordBadges({
  isWorldRecord,
  isContinentRecord,
  isCountryRecord,
  continentId,
}: {
  isWorldRecord: boolean;
  isContinentRecord: boolean;
  isCountryRecord: boolean;
  continentId: string;
}): RecordBadgeCode[] {
  if (isWorldRecord) return ["WR"];
  if (isContinentRecord && continentRecordCodes[continentId]) {
    return [continentRecordCodes[continentId]];
  }
  if (isCountryRecord) return ["NR"];
  return [];
}
