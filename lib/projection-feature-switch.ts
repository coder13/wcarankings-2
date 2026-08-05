import { query } from "@/db";
import {
  UNAVAILABLE_PROJECTION_FEATURE_SWITCH,
  type ProjectionFeatureSwitch,
} from "@/lib/projection-feature-switch-types";

export type { ProjectionFeatureSwitch } from "@/lib/projection-feature-switch-types";

const CORE_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
] as const;
const RESULT_RANKINGS_TABLES = [
  "result_rankings_single",
  "result_rankings_average",
  "result_ranking_counts",
] as const;
const COMPETITION_RANKINGS_TABLES = [
  "competition_podium_members",
  "competition_event_stats",
  "competition_stats",
] as const;
const PERSON_ACTIVITY_RANKINGS_TABLES = [
  "person_activity_counts",
  "person_activity_rankings",
  "person_activity_ranking_counts",
] as const;
const PERSON_COMPETITION_RANKINGS_TABLES = [
  "person_competition_counts",
  "person_competition_year_counts",
  "person_competition_rankings",
  "person_competition_ranking_counts",
] as const;
const PERSON_MEDAL_RANKINGS_TABLES = [
  "person_medal_scores",
  "person_medal_rankings",
  "person_medal_ranking_counts",
] as const;
const CITY_EVENT_STATS_TABLES = ["city_event_stats"] as const;
const SUM_OF_RANKS_TABLES = ["person_sum_of_ranks_scores"] as const;
const YEARLY_TABLES = [
  "person_year_ranking_cohorts",
  "person_year_rankings_single",
  "person_year_rankings_average",
  "person_year_ranking_counts",
] as const;

let cached: { value: ProjectionFeatureSwitch; expiresAt: number } | null = null;
let loading: Promise<ProjectionFeatureSwitch> | null = null;
const CACHE_TTL_MS = 5_000;

function allPresent(tables: Set<string>, required: readonly string[]) {
  return required.every((table) => tables.has(table));
}

export function featureSwitchFromTables(
  tables: Iterable<string>,
  generation: Pick<ProjectionFeatureSwitch, "generationId" | "exportId"> = {
    generationId: null,
    exportId: null,
  },
): ProjectionFeatureSwitch {
  const present = new Set(tables);
  return {
    ...generation,
    core: allPresent(present, CORE_TABLES),
    resultRankings: allPresent(present, RESULT_RANKINGS_TABLES),
    competitionRankings: allPresent(present, COMPETITION_RANKINGS_TABLES),
    personActivityRankings: allPresent(
      present,
      PERSON_ACTIVITY_RANKINGS_TABLES,
    ),
    personCompetitionRankings: allPresent(
      present,
      PERSON_COMPETITION_RANKINGS_TABLES,
    ),
    personMedalRankings: allPresent(present, PERSON_MEDAL_RANKINGS_TABLES),
    cityEventStats: allPresent(present, CITY_EVENT_STATS_TABLES),
    sumOfRanks: allPresent(present, SUM_OF_RANKS_TABLES),
    yearlyPersonRankings: allPresent(present, YEARLY_TABLES),
  };
}

async function loadProjectionFeatureSwitch() {
  try {
    const state = await query<{
      generation_id: string;
      export_id: string;
      capabilities_json: string;
    }>(`SELECT generation_id, export_id, capabilities_json
          FROM ranking_generation_state WHERE id = 1 LIMIT 1`);
    const row = state.rows[0];
    if (!row) return UNAVAILABLE_PROJECTION_FEATURE_SWITCH;
    const capabilities = JSON.parse(row.capabilities_json) as Record<
      string,
      unknown
    >;
    return {
      generationId: row.generation_id,
      exportId: row.export_id,
      core: capabilities.core === true || capabilities.core === 1,
      resultRankings:
        capabilities.resultRankings === true ||
        capabilities.resultRankings === 1,
      competitionRankings:
        capabilities.competitionRankings === true ||
        capabilities.competitionRankings === 1,
      personActivityRankings:
        capabilities.personActivityRankings === true ||
        capabilities.personActivityRankings === 1,
      personCompetitionRankings:
        capabilities.personCompetitionRankings === true ||
        capabilities.personCompetitionRankings === 1,
      personMedalRankings:
        capabilities.personMedalRankings === true ||
        capabilities.personMedalRankings === 1,
      cityEventStats:
        capabilities.cityEventStats === true ||
        capabilities.cityEventStats === 1,
      sumOfRanks:
        capabilities.sumOfRanks === true || capabilities.sumOfRanks === 1,
      yearlyPersonRankings:
        capabilities.yearlyPersonRankings === true ||
        capabilities.yearlyPersonRankings === 1,
    };
  } catch {
    // Do not advertise projection-backed routes when the capability snapshot
    // cannot be read. Lists and other non-projection pages can still render.
    return UNAVAILABLE_PROJECTION_FEATURE_SWITCH;
  }
}

export async function getProjectionFeatureSwitch() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  if (!loading) {
    loading = loadProjectionFeatureSwitch()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}
