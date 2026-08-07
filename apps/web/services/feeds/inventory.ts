import { WCA_EVENTS, type GenderFilter, type RankingType } from "@/lib/wca";
import type { RegionRecord } from "@/services/regions/types";

export type FeedInventoryRegion = {
  scope: "world" | "continent" | "country";
  regionId: string;
  name: string;
};

export type FeedStatKind =
  | "person"
  | "result"
  | "person-competition"
  | "person-medals"
  | "person-activity-countries"
  | "person-activity-rounds"
  | "person-activity-solves"
  | "competition"
  | "city";

export const FEED_STAT_KINDS: readonly FeedStatKind[] = [
  "person",
  "result",
  "person-competition",
  "person-medals",
  "person-activity-countries",
  "person-activity-rounds",
  "person-activity-solves",
  "competition",
  "city",
];

const ACTIVITY_KINDS = new Set<FeedStatKind>([
  "person-activity-countries",
  "person-activity-rounds",
  "person-activity-solves",
]);

const FEED_METRIC_EVENTS = [
  { id: "SOR", name: "Sum of Ranks", resultTypes: ["single", "average"] },
  { id: "sor-kinch", name: "Kinch", resultTypes: ["single"] },
  { id: "pr-streak", name: "PR Streak", resultTypes: ["single"] },
] as const;

const FEED_METRIC_EVENT_IDS = new Set<string>(
  FEED_METRIC_EVENTS.map((event) => event.id),
);

export type FeedInventoryStat = {
  id: string;
  eventId: string;
  eventName: string;
  resultType: RankingType;
  kind: FeedStatKind;
  region: FeedInventoryRegion;
  gender: GenderFilter | null;
  year: 2026 | null;
  title: string;
  exploreUrl: string;
};

const GENDERS: readonly (GenderFilter | null)[] = [null, "f", "o"];

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

export function feedStatKindName(kind: FeedStatKind) {
  if (kind === "person") return "Person rankings";
  if (kind === "result") return "Person result rankings";
  if (kind === "person-competition") return "Person competition rankings";
  if (kind === "person-medals") return "Person medal rankings";
  if (kind === "person-activity-countries")
    return "Person activity · Countries";
  if (kind === "person-activity-rounds") return "Person activity · Rounds";
  if (kind === "person-activity-solves")
    return "Person activity · Official solves";
  if (kind === "competition") return "Competition rankings";
  return "City rankings";
}

function isActivityKind(kind: FeedStatKind) {
  return ACTIVITY_KINDS.has(kind);
}

function exploreUrl({
  kind,
  eventId,
  resultType,
  region,
  gender,
  year,
}: {
  kind: FeedStatKind;
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
  if (kind === "person" && eventId === "pr-streak") {
    return `/persons/pr-streak?${params.toString()}`;
  }
  if (kind === "person") return `/?${params.toString()}`;
  if (kind === "result") return `/results?${params.toString()}`;
  if (kind === "person-competition") return "/persons/competitions";
  if (kind === "person-medals") return "/persons/medals?medal=overall";
  if (isActivityKind(kind)) {
    params.set("metric", kind.replace("person-activity-", ""));
    return `/api/rankings/people/activity?${params.toString()}`;
  }
  if (kind === "competition") {
    params.set("ranking", "fastest");
    return `/competitions?${params.toString()}`;
  }
  return `/cities?${params.toString()}`;
}

export function buildFeedStatInventory({
  continents,
  countries,
}: {
  continents: readonly RegionRecord[];
  countries: readonly RegionRecord[];
}) {
  const inventory: FeedInventoryStat[] = [];
  const events: readonly {
    id: string;
    name: string;
    resultTypes: readonly RankingType[];
  }[] = [
    ...WCA_EVENTS.map((event) => ({
      ...event,
      resultTypes: ["single", "average"] as const,
    })),
    ...FEED_METRIC_EVENTS,
  ];
  for (const event of events) {
    for (const resultType of ["single", "average"] as const) {
      if (!event.resultTypes.includes(resultType)) continue;
      const eventId = event.id;
      for (const region of regions(continents, countries)) {
        for (const gender of GENDERS) {
          for (const year of [null, 2026] as const) {
            const suffix = [
              region.name,
              genderName(gender),
              year === null ? "All time" : String(year),
            ].join(" · ");
            for (const kind of FEED_STAT_KINDS) {
              if (isActivityKind(kind)) continue;
              if (FEED_METRIC_EVENT_IDS.has(eventId) && kind !== "person")
                continue;
              if (eventId === "sor-kinch" && resultType !== "single") continue;
              const family = kind;
              const title = `${event.name} · ${feedStatKindName(kind)} · ${resultName(resultType)} · ${suffix}`;
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
  }
  for (const kind of ACTIVITY_KINDS) {
    for (const region of regions(continents, countries)) {
      for (const gender of GENDERS) {
        const title = `Person activity · ${feedStatKindName(kind)} · ${region.name} · ${genderName(gender)} · All time`;
        inventory.push({
          id: `${kind}-activity-single-${region.scope}-${region.regionId || "world"}-${gender ?? "all"}-all`,
          eventId: "activity",
          eventName: "Person activity",
          resultType: "single",
          kind,
          region,
          gender,
          year: null,
          title,
          exploreUrl: exploreUrl({
            kind,
            eventId: "activity",
            resultType: "single",
            region,
            gender,
            year: null,
          }),
        });
      }
    }
  }
  return inventory;
}

export function buildRecentFeedStatInventory({
  references,
  continents,
  countries,
}: {
  references: readonly {
    eventId: string;
    countryId: string;
    continentId: string;
    gender: GenderFilter | null;
  }[];
  continents: readonly RegionRecord[];
  countries: readonly RegionRecord[];
}) {
  const continentNames = new Map(
    continents.map((region) => [region.id, region.name]),
  );
  const countryNames = new Map(
    countries.map((region) => [region.id, region.name]),
  );
  const inventory = new Map<string, FeedInventoryStat>();
  for (const reference of references) {
    const event = WCA_EVENTS.find(
      (candidate) => candidate.id === reference.eventId,
    );
    if (!event) continue;
    const affectedRegions: FeedInventoryRegion[] = [
      { scope: "world", regionId: "", name: "World" },
    ];
    if (reference.continentId && continentNames.has(reference.continentId)) {
      affectedRegions.push({
        scope: "continent",
        regionId: reference.continentId,
        name: continentNames.get(reference.continentId)!,
      });
    }
    if (reference.countryId && countryNames.has(reference.countryId)) {
      affectedRegions.push({
        scope: "country",
        regionId: reference.countryId,
        name: countryNames.get(reference.countryId)!,
      });
    }
    const genders = [null, reference.gender].filter(
      (gender, index, values): gender is GenderFilter | null =>
        (gender === null || gender === "f" || gender === "o") &&
        values.indexOf(gender) === index,
    );
    for (const resultType of ["single", "average"] as const) {
      for (const region of affectedRegions) {
        for (const gender of genders) {
          for (const year of [null, 2026] as const) {
            for (const kind of FEED_STAT_KINDS) {
              if (isActivityKind(kind)) continue;
              const suffix = [
                region.name,
                genderName(gender),
                year === null ? "All time" : String(year),
              ].join(" · ");
              const id = `${kind}-${event.id}-${resultType}-${region.scope}-${region.regionId || "world"}-${gender ?? "all"}-${year ?? "all"}`;
              inventory.set(id, {
                id,
                eventId: event.id,
                eventName: event.name,
                resultType,
                kind,
                region,
                gender,
                year,
                title: `${event.name} · ${feedStatKindName(kind)} · ${resultName(resultType)} · ${suffix}`,
                exploreUrl: exploreUrl({
                  kind,
                  eventId: event.id,
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
    for (const region of affectedRegions) {
      for (const gender of genders) {
        for (const kind of ACTIVITY_KINDS) {
          const id = `${kind}-activity-single-${region.scope}-${region.regionId || "world"}-${gender ?? "all"}-all`;
          inventory.set(id, {
            id,
            eventId: "activity",
            eventName: "Person activity",
            resultType: "single",
            kind,
            region,
            gender,
            year: null,
            title: `Person activity · ${feedStatKindName(kind)} · ${region.name} · ${genderName(gender)} · All time`,
            exploreUrl: exploreUrl({
              kind,
              eventId: "activity",
              resultType: "single",
              region,
              gender,
              year: null,
            }),
          });
        }
        for (const metricEvent of FEED_METRIC_EVENTS) {
          for (const resultType of metricEvent.resultTypes) {
            for (const year of [null, 2026] as const) {
              const id = `person-${metricEvent.id}-${resultType}-${region.scope}-${region.regionId || "world"}-${gender ?? "all"}-${year ?? "all"}`;
              inventory.set(id, {
                id,
                eventId: metricEvent.id,
                eventName: metricEvent.name,
                resultType,
                kind: "person",
                region,
                gender,
                year,
                title: `${metricEvent.name} · Person rankings · ${resultName(resultType)} · ${region.name} · ${genderName(gender)} · ${year === null ? "All time" : year}`,
                exploreUrl: exploreUrl({
                  kind: "person",
                  eventId: metricEvent.id,
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
  }
  return [...inventory.values()];
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
        (source.kind === "result" || source.kind === "competition" ? 10 : 0) +
        (source.gender === null ? 4 : 0) +
        (source.year === 2026 ? 2 : 0),
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.index - right.index,
    )
    .map(({ source }) => source);
}
