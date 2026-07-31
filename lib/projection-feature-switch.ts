import { query } from "@/db";
import { UNAVAILABLE_PROJECTION_FEATURE_SWITCH, type ProjectionFeatureSwitch } from "@/lib/projection-feature-switch-types";

export { DEFAULT_PROJECTION_FEATURE_SWITCH } from "@/lib/projection-feature-switch-types";
export type { ProjectionFeatureSwitch } from "@/lib/projection-feature-switch-types";

const CORE_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
  "result_entries_single",
  "result_counts",
  "competition_podium_members",
  "competition_event_stats",
  "result_facts",
  "result_rankings_single",
  "result_rankings_average",
  "result_ranking_counts",
  "competition_stats",
] as const;
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
  generation: Pick<ProjectionFeatureSwitch, "generationId" | "exportId"> = { generationId: null, exportId: null },
): ProjectionFeatureSwitch {
  const present = new Set(tables);
  return {
    ...generation,
    core: allPresent(present, CORE_TABLES),
    sumOfRanks: allPresent(present, SUM_OF_RANKS_TABLES),
    yearlyPersonRankings: allPresent(present, YEARLY_TABLES),
  };
}

async function loadProjectionFeatureSwitch() {
  try {
    const [tables, state] = await Promise.all([
      query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_name IN (${[...CORE_TABLES, ...SUM_OF_RANKS_TABLES, ...YEARLY_TABLES].map(() => "?").join(", ")})`,
        [...CORE_TABLES, ...SUM_OF_RANKS_TABLES, ...YEARLY_TABLES],
      ),
      query<{ generation_id: string; export_id: string }>(
        `SELECT generation_id, export_id FROM ranking_generation_state WHERE id = 1 LIMIT 1`,
      ).catch((error) => {
        if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return { rows: [] };
        throw error;
      }),
    ]);
    return featureSwitchFromTables(
      tables.rows.map((row) => row.table_name),
      { generationId: state.rows[0]?.generation_id ?? null, exportId: state.rows[0]?.export_id ?? null },
    );
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
    loading = loadProjectionFeatureSwitch().then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }).finally(() => { loading = null; });
  }
  return loading;
}

export function resetProjectionFeatureSwitchForTests() {
  cached = null;
  loading = null;
}
