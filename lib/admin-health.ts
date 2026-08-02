import { getDatabaseDiagnostics, query } from "@/db";
import {
  rankingsPageCache,
  type RankingsCacheSnapshot,
} from "@/services/rankings/cache";

export const capabilityTables = {
  core: [
    "ranking_entries_single",
    "ranking_entries_average",
    "ranking_counts",
    "result_entries_single",
    "result_counts",
  ],
  resultRankings: [
    "result_rankings_single",
    "result_rankings_average",
    "result_gender_rankings_single",
    "result_gender_rankings_average",
    "result_ranking_counts",
    "result_gender_ranking_counts",
  ],
  competitionRankings: [
    "competition_podium_members",
    "competition_event_stats",
    "competition_stats",
  ],
  personCompetitionRankings: [
    "person_competition_counts",
    "person_competition_rankings",
    "person_competition_ranking_counts",
  ],
  cityEventStats: ["city_event_stats", "entity_ranking_counts"],
  sumOfRanks: ["person_sum_of_ranks_scores"],
  yearlyPersonRankings: [
    "person_year_ranking_cohorts",
    "person_year_rankings_single",
    "person_year_rankings_average",
    "person_year_ranking_counts",
  ],
} as const;

type CapabilityName = keyof typeof capabilityTables;
type CapabilitySnapshot = {
  status: string;
  persisted: boolean | null;
  presentTables: number;
  totalTables: number;
  tables: Array<{ name: string; present: boolean }>;
};
type GenerationRow = {
  generation_id: string;
  export_id: string;
  artifact_format_version: number;
  dataset_schema_version: number;
  fingerprints_json: string;
  capabilities_json: string;
  source_sha: string;
  artifact_run_id: number;
  artifact_id: number;
  activation_tables_json: string;
  previous_tables_json: string;
  activated_at: string;
};

type MetadataRow = { key: string; value: string };

function parseJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function getCapabilityStatus({
  persisted,
  present,
  total,
  hasGeneration,
}: {
  persisted: boolean | undefined;
  present: number;
  total: number;
  hasGeneration: boolean;
}) {
  if (!hasGeneration) {
    if (present === 0 || present === total) return "unknown";
    return "partial";
  }
  if (present === total && persisted === true) return "enabled";
  if (present > 0) return "partial";
  return "unavailable";
}

export type AdminHealthSnapshot = {
  generatedAt: string;
  status: "healthy" | "degraded" | "unknown";
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    pid: number;
    startedAt: string;
    memory: NodeJS.MemoryUsage;
  };
  database: ReturnType<typeof getDatabaseDiagnostics> & {
    available: boolean;
    error: string | null;
  };
  cache: RankingsCacheSnapshot;
  currentExport: { date: string | null; fetchedAt: string | null };
  generation: {
    generationId: string;
    exportId: string;
    activatedAt: string;
    sourceSha: string;
    artifactFormatVersion: number;
    datasetSchemaVersion: number;
    artifactRunId: number;
    artifactId: number;
    artifactRunUrl: string;
    semanticFingerprints: Record<string, string>;
    artifactFingerprints: Record<string, string>;
    artifactDigests: Record<string, string | null>;
    capabilities: Record<CapabilityName, CapabilitySnapshot>;
    activationTables: string[];
    previousTables: string[];
  } | null;
  diagnostics: string[];
};

function emptyCache(): RankingsCacheSnapshot {
  return rankingsPageCache.snapshot();
}

export async function getAdminHealthSnapshot(): Promise<AdminHealthSnapshot> {
  const generatedAt = new Date().toISOString();
  const runtime = {
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    pid: process.pid,
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    memory: process.memoryUsage(),
  };
  const databaseConfig = getDatabaseDiagnostics();
  const cache = emptyCache();
  const diagnostics: string[] = [];

  try {
    const [metadataResult, generationResult, tableResult] = await Promise.all([
      query<MetadataRow>(
        "SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')",
      ),
      query<GenerationRow>(
        "SELECT generation_id, export_id, artifact_format_version, dataset_schema_version, fingerprints_json, capabilities_json, source_sha, artifact_run_id, artifact_id, activation_tables_json, previous_tables_json, activated_at FROM ranking_generation_state WHERE id = 1",
      ),
      query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
      ),
    ]);
    const metadata = Object.fromEntries(
      metadataResult.rows.map((row) => [row.key, row.value]),
    );
    const row = generationResult.rows[0];
    const presentTables = new Set(tableResult.rows.map((table) => table.name));
    const fingerprints = row
      ? (parseJson(row.fingerprints_json, {}) as {
          semantic?: Record<string, string>;
          artifacts?: Record<string, string>;
          digests?: Record<string, string | null>;
        })
      : {};
    const persistedCapabilities = row
      ? (parseJson(row.capabilities_json || "{}", {}) as Record<
          string,
          boolean
        >)
      : {};
    const capabilities = Object.fromEntries(
      Object.entries(capabilityTables).map(([name, tables]) => {
        const tableState = tables.map((table) => ({
          name: table as string,
          present: presentTables.has(table),
        }));
        const present = tableState.filter((table) => table.present).length;
        return [
          name,
          {
            status: getCapabilityStatus({
              persisted: persistedCapabilities[name],
              present,
              total: tables.length,
              hasGeneration: Boolean(row),
            }),
            persisted: row ? (persistedCapabilities[name] ?? null) : null,
            presentTables: present,
            totalTables: tables.length,
            tables: tableState,
          },
        ];
      }),
    ) as Record<CapabilityName, CapabilitySnapshot>;
    let status: AdminHealthSnapshot["status"] = "healthy";
    if (!row) status = "unknown";
    else if (
      capabilities.core.status !== "enabled" ||
      Object.values(capabilities).some(
        (capability) => capability.status === "partial",
      )
    )
      status = "degraded";
    return {
      generatedAt,
      status,
      runtime,
      database: { ...databaseConfig, available: true, error: null },
      cache,
      currentExport: {
        date: metadata.export_date ?? null,
        fetchedAt: metadata.fetched_at ?? null,
      },
      generation: row
        ? {
            generationId: row.generation_id,
            exportId: row.export_id,
            activatedAt: row.activated_at,
            sourceSha: row.source_sha,
            artifactFormatVersion: Number(row.artifact_format_version),
            datasetSchemaVersion: Number(row.dataset_schema_version),
            artifactRunId: Number(row.artifact_run_id),
            artifactId: Number(row.artifact_id),
            artifactRunUrl: `https://github.com/coder13/wcarankings-2/actions/runs/${row.artifact_run_id}`,
            semanticFingerprints: fingerprints.semantic ?? {},
            artifactFingerprints: fingerprints.artifacts ?? {},
            artifactDigests: fingerprints.digests ?? {},
            capabilities,
            activationTables: parseJson(
              row.activation_tables_json,
              [],
            ) as string[],
            previousTables: parseJson(row.previous_tables_json, []) as string[],
          }
        : null,
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(
      error instanceof Error
        ? error.message
        : "Database health could not be read.",
    );
    return {
      generatedAt,
      status: "degraded",
      runtime,
      database: {
        ...databaseConfig,
        available: false,
        error: error instanceof Error ? error.name : "unknown",
      },
      cache,
      currentExport: { date: null, fetchedAt: null },
      generation: null,
      diagnostics,
    };
  }
}
