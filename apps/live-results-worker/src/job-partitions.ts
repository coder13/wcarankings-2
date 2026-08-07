import type { ProjectionJob } from "@wcarankings/projection-jobs";
import type {
  LiveResultsSnapshot,
  LiveResultsSourceRow,
} from "@wcarankings/live-results";

const PERSON_STATS_SHARD_COUNT = 16;
const ACTIVITY_METRICS = ["competitions", "countries", "rounds", "solves"];
const RESULT_TYPES = ["single", "average"];
const PERIODS = ["all-time", "year"] as const;

type Gender = "m" | "f" | "o";
type Period = (typeof PERIODS)[number];

export type SnapshotResultIdentity = {
  countryIso2: string | null;
  eventId: string;
  personId: string;
};

export type AffectedResultScope = SnapshotResultIdentity & {
  continentId: string | null;
  countryId: string | null;
  gender: Gender;
};

type Scope = {
  gender: "all" | Gender;
  regionId: string;
  scope: "world" | "continent" | "country";
};

export function partitionJobs(
  source: LiveResultsSourceRow,
  snapshot: LiveResultsSnapshot,
  version: number,
  previousResults: SnapshotResultIdentity[],
  affectedResults: AffectedResultScope[],
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

  add(`competition-stats:${source.competition_id}`, {
    competitionId: source.competition_id,
    year,
  });
  for (const result of resultIdentities) {
    const shard = personStatsShard(result.personId);
    const people = peopleByShard.get(shard) ?? new Set<string>();
    people.add(result.personId);
    peopleByShard.set(shard, people);
    add(`competition-event-stats:${source.competition_id}:${result.eventId}`, {
      competitionId: source.competition_id,
      eventId: result.eventId,
      year,
    });
  }
  for (const [shard, people] of peopleByShard) {
    const personIds = [...people].sort().join(",");
    add(`person-stats:${year}:${shard}`, { personIds, year });
    add(`person-event-bests:${year}:${shard}`, { personIds, year });
  }

  for (const result of affectedResults) {
    for (const period of PERIODS) {
      const periodYear = period === "all-time" ? "0" : year;
      for (const scope of scopesForResult(result)) {
        add(`result-rankings:${period}:${result.eventId}:${scopeKey(scope)}`, {
          eventId: result.eventId,
          periodYear,
          ...scope,
        });
        add(
          `person-event-rankings:${period}:${result.eventId}:${scopeKey(scope)}`,
          { eventId: result.eventId, periodYear, ...scope },
        );
        for (const metric of ACTIVITY_METRICS) {
          add(`activity-rankings:${period}:${metric}:${scopeKey(scope)}`, {
            metric,
            periodYear,
            ...scope,
          });
        }
        for (const resultType of RESULT_TYPES) {
          add(
            `yearly-rankings:${period}:${result.eventId}:${resultType}:${scopeKey(scope)}`,
            {
              eventId: result.eventId,
              periodYear,
              resultType,
              ...scope,
            },
          );
        }
        for (const eventId of ["", result.eventId]) {
          add(
            `medal-rankings:${period}:${eventId || "all"}:${scopeKey(scope)}`,
            {
              eventId,
              periodYear,
              ...scope,
            },
          );
        }
      }
    }
    for (const gender of gendersForResult(result)) {
      add(`city-stats:${source.competition_id}:${result.eventId}:${gender}`, {
        competitionId: source.competition_id,
        eventId: result.eventId,
        gender,
        year,
      });
    }
  }

  return [...jobs].map(([key, payload]) => ({
    kind: "projection-rebuild" as const,
    key,
    version,
    payload,
  }));
}

function scopesForResult(result: AffectedResultScope): Scope[] {
  const genders = gendersForResult(result);
  const scopes: Scope[] = genders.map((gender) => ({
    gender,
    regionId: "",
    scope: "world",
  }));
  if (result.continentId)
    scopes.push(
      ...genders.map((gender) => ({
        gender,
        regionId: result.continentId ?? "",
        scope: "continent" as const,
      })),
    );
  if (result.countryId)
    scopes.push(
      ...genders.map((gender) => ({
        gender,
        regionId: result.countryId ?? "",
        scope: "country" as const,
      })),
    );
  return scopes;
}

function gendersForResult(result: AffectedResultScope): ("all" | Gender)[] {
  return ["all", result.gender];
}

function scopeKey(scope: Scope): string {
  return `${scope.scope}:${scope.regionId || "world"}:${scope.gender}`;
}

function personStatsShard(personId: string): number {
  let value = 0;
  for (const character of personId)
    value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % PERSON_STATS_SHARD_COUNT;
}
