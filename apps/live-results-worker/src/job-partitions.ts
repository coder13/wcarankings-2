import type { ProjectionJob } from "@wcarankings/projection-jobs";
import type {
  LiveResultsSnapshot,
  LiveResultsSourceRow,
} from "@wcarankings/live-results";

const PERSON_STATS_SHARD_COUNT = 16;
export type SnapshotResultIdentity = {
  countryIso2: string | null;
  eventId: string;
  personId: string;
};

export type CountryRegion = {
  continentId: string;
  countryId: string;
};

export type PersonRegion = CountryRegion & {
  gender: "m" | "f" | "o";
};

export function partitionJobs(
  source: LiveResultsSourceRow,
  snapshot: LiveResultsSnapshot,
  version: number,
  previousResults: SnapshotResultIdentity[],
  countryRegionsByIso2: ReadonlyMap<string, CountryRegion> = new Map(),
  personRegionsById: ReadonlyMap<string, PersonRegion> = new Map(),
): ProjectionJob[] {
  const jobs = new Map<string, Record<string, string>>();
  const add = (key: string, payload: Record<string, string>) =>
    jobs.set(key, payload);
  const year = String(source.competition_year);
  const resultIdentities = [
    ...previousResults,
    ...snapshot.results.map((result) => ({
      countryIso2: result.countryIso2,
      eventId: result.eventId,
      personId: result.personId,
    })),
  ];
  const peopleByShard = new Map<number, Set<string>>();
  const eventIds = new Set<string>();
  const countryIdsByContinent = new Map<string, Set<string>>();
  const continentIds = new Set<string>();
  const countryIds = new Set<string>();

  add(`competition-stats:${source.competition_id}`, {
    competitionId: source.competition_id,
    year,
  });
  for (const result of resultIdentities) {
    eventIds.add(result.eventId);
    const shard = personStatsShard(result.personId);
    const people = peopleByShard.get(shard) ?? new Set<string>();
    people.add(result.personId);
    peopleByShard.set(shard, people);
    add(`competition-event-stats:${source.competition_id}:${result.eventId}`, {
      competitionId: source.competition_id,
      eventId: result.eventId,
      year,
    });
    add(`city-stats:${source.competition_id}:${result.eventId}`, {
      competitionId: source.competition_id,
      eventId: result.eventId,
    });
    if (!result.countryIso2) continue;
    const region = countryRegionsByIso2.get(result.countryIso2);
    if (!region) continue;
    const countryIdsForContinent =
      countryIdsByContinent.get(region.continentId) ?? new Set();
    continentIds.add(region.continentId);
    countryIds.add(region.countryId);
    countryIdsForContinent.add(region.countryId);
    countryIdsByContinent.set(region.continentId, countryIdsForContinent);
  }
  for (const [shard, people] of peopleByShard) {
    const personIds = [...people].sort().join(",");
    add(`person-stats:${year}:${shard}`, { personIds, year });
    add(`person-event-bests:${year}:${shard}`, { personIds, year });
    add(`medal-scores:${year}:${shard}`, { personIds, year });
  }
  for (const periodYear of ["0", year]) {
    for (const metric of [
      "country-count",
      "round-count",
      "solve-count",
    ] as const) {
      for (const gender of ["all", "m", "f", "o"] as const) {
        add(
          `person-stat-rankings:${periodYear}:${metric}:world::${gender}`,
          {
            gender,
            metric,
            periodYear,
            regionId: "",
            scope: "world",
          },
        );
        for (const continentId of [...continentIds].sort()) {
          add(
            `person-stat-rankings:${periodYear}:${metric}:continent:${continentId}:${gender}`,
            {
              gender,
              metric,
              periodYear,
              regionId: continentId,
              scope: "continent",
            },
          );
        }
        for (const countryId of [...countryIds].sort()) {
          add(
            `person-stat-rankings:${periodYear}:${metric}:country:${countryId}:${gender}`,
            {
              gender,
              metric,
              periodYear,
              regionId: countryId,
              scope: "country",
            },
          );
        }
      }
    }
  }
  for (const [personId, region] of [...personRegionsById].sort()) {
    if (!resultIdentities.some((result) => result.personId === personId))
      continue;
    for (const gender of ["all", region.gender]) {
      add(`competition-rankings:world::${gender}`, {
        gender,
        regionId: "",
        scope: "world",
      });
      add(`competition-rankings:continent:${region.continentId}:${gender}`, {
        gender,
        regionId: region.continentId,
        scope: "continent",
      });
      add(`competition-rankings:country:${region.countryId}:${gender}`, {
        gender,
        regionId: region.countryId,
        scope: "country",
      });
    }
  }
  for (const eventId of eventIds) {
    add(`yearly-rankings:${year}:${eventId}:single`, {
      eventId,
      resultType: "single",
      year,
    });
    add(`yearly-rankings:${year}:${eventId}:average`, {
      eventId,
      resultType: "average",
      year,
    });
    const rankingRegions = [
      { regionId: "", scope: "world" as const },
      ...[...continentIds].sort().map((regionId) => ({
        regionId,
        scope: "continent" as const,
      })),
      ...[...countryIds].sort().map((regionId) => ({
        regionId,
        scope: "country" as const,
      })),
    ];
    for (const periodYear of ["0", year]) {
      for (const scope of rankingRegions) {
        for (const gender of ["all", "m", "f", "o"] as const) {
          for (const resultType of ["single", "average"] as const) {
            add(
              `result-rankings:${periodYear}:${eventId}:${resultType}:${scope.scope}:${scope.regionId || "world"}:${gender}`,
              {
                eventId,
                gender,
                periodYear,
                regionId: scope.regionId,
                resultType,
                scope: scope.scope,
              },
            );
          }
        }
      }
    }
    for (const continentId of [...countryIdsByContinent.keys()].sort()) {
      for (const resultType of ["single", "average"] as const) {
        const payload = { continentId, eventId, resultType, year };
        add(
          `person-event-rankings:${year}:${eventId}:${resultType}:${continentId}`,
          payload,
        );
      }
    }
  }
  for (const [continentId, countryIds] of [...countryIdsByContinent].sort()) {
    add(`sum-of-ranks:continent:${continentId}`, {
      countryIds: [...countryIds].sort().join(","),
      regionId: continentId,
      scope: "continent",
    });
  }
  return [...jobs].map(([key, payload]) => ({
    kind: "projection-rebuild" as const,
    key,
    version,
    payload,
  }));
}

function personStatsShard(personId: string): number {
  let value = 0;
  for (const character of personId)
    value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % PERSON_STATS_SHARD_COUNT;
}
