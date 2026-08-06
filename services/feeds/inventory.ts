import { WCA_EVENTS, type GenderFilter, type RankingType } from "@/lib/wca";
import type { RegionRecord } from "@/services/regions/types";

export type FeedInventoryRegion = {
  scope: "world" | "continent" | "country";
  regionId: string;
  name: string;
};

export type FeedInventoryStat = {
  id: string;
  eventId: string;
  eventName: string;
  resultType: RankingType;
  kind: "person" | "result";
  region: FeedInventoryRegion;
  gender: GenderFilter | null;
  year: 2026 | null;
  title: string;
  exploreUrl: string;
};

const SOURCE_VARIANTS = [
  ["333", "single"],
  ["333", "average"],
  ["222", "single"],
  ["222", "average"],
  ["444", "single"],
  ["444", "average"],
  ["555", "single"],
  ["555", "average"],
  ["333oh", "single"],
  ["pyram", "single"],
] as const satisfies readonly (readonly [string, RankingType])[];

const GENDERS: readonly (GenderFilter | null)[] = [null, "m", "f", "o"];

function regions(
  continents: readonly RegionRecord[],
  countries: readonly RegionRecord[],
): FeedInventoryRegion[] {
  return [
    { scope: "world" as const, regionId: "", name: "World" },
    ...continents.map((region) => ({
      scope: "continent" as const,
      regionId: region.id,
      name: region.name,
    })),
    ...countries.map((region) => ({
      scope: "country" as const,
      regionId: region.id,
      name: region.name,
    })),
  ];
}

function genderName(gender: GenderFilter | null) {
  if (gender === "m") return "Men";
  if (gender === "f") return "Women";
  if (gender === "o") return "Other";
  return "Everyone";
}

function resultName(resultType: RankingType) {
  return resultType === "single" ? "Single" : "Average";
}

function exploreUrl({
  kind,
  eventId,
  resultType,
  region,
  gender,
  year,
}: {
  kind: "person" | "result";
  eventId: string;
  resultType: RankingType;
  region: FeedInventoryRegion;
  gender: GenderFilter | null;
  year: 2026 | null;
}) {
  const params = new URLSearchParams({ eventId, result: resultType });
  if (region.scope !== "world") params.set("region", region.regionId);
  if (gender !== null) params.set("gender", gender);
  if (year !== null) params.set("year", String(year));
  return `${kind === "person" ? "/" : "/results"}?${params.toString()}`;
}

export function buildFeedStatInventory({
  continents,
  countries,
}: {
  continents: readonly RegionRecord[];
  countries: readonly RegionRecord[];
}) {
  const inventory: FeedInventoryStat[] = [];
  for (const [eventId, resultType] of SOURCE_VARIANTS) {
    const event = WCA_EVENTS.find((candidate) => candidate.id === eventId);
    if (!event) continue;
    for (const region of regions(continents, countries)) {
      for (const gender of GENDERS) {
        for (const year of [null, 2026] as const) {
          const suffix = [
            region.name,
            genderName(gender),
            year === null ? "All time" : String(year),
          ].join(" · ");
          for (const kind of ["person", "result"] as const) {
            const family = kind === "person" ? "person" : "result";
            const title = `${event.name} · ${resultName(resultType)} · ${suffix}`;
            inventory.push({
              id: `${family}-${eventId}-${resultType}-${region.scope}-${region.regionId || "world"}-${gender ?? "all"}-${year ?? "all"}`,
              eventId,
              eventName: event.name,
              resultType,
              kind,
              region,
              gender,
              year,
              title,
              exploreUrl: exploreUrl({
                kind,
                eventId,
                resultType,
                region,
                gender,
                year,
              }),
            });
          }
        }
      }
    }
  }
  return inventory;
}

export function prioritizeFeedStatInventory(
  inventory: readonly FeedInventoryStat[],
  triggers: readonly { countryId: string; eventIds: readonly string[] }[],
) {
  const recentCountries = new Set(
    triggers.map((trigger) => trigger.countryId).filter(Boolean),
  );
  const recentEvents = new Set(triggers.flatMap((trigger) => trigger.eventIds));

  return inventory
    .map((source, index) => ({
      source,
      index,
      priority:
        (source.region.scope === "country" &&
        recentCountries.has(source.region.regionId)
          ? 1_000
          : 0) +
        (recentEvents.has(source.eventId) ? 100 : 0) +
        (source.kind === "result" ? 10 : 0) +
        (source.gender === null ? 4 : 0) +
        (source.year === 2026 ? 2 : 0),
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .map(({ source }) => source);
}
