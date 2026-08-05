import type {
  GenerationConnection,
  GenerationState,
  GenerationStateRow,
  LockRow,
  TableNameRow,
} from "./types.ts";

const LOCK_NAME = "wcarankings-ranking-generation";

function identifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw new Error(`${label} is not a safe MariaDB identifier`);
  }
  return `\`${value}\``;
}

export function validateSchemaName(value: string, label: string): void {
  identifier(value, label);
}

export function qualified(schema: string, table: string): string {
  return `${identifier(schema, "schema")}.${identifier(table, "table")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error("Generation state JSON is invalid");
  return parsed;
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function nullableStringMap(value: unknown): Record<string, string | null> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string | null] =>
        typeof entry[1] === "string" || entry[1] === null,
    ),
  );
}

function booleanMap(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function stringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error("Generation state table list is invalid");
  }
  return parsed;
}

export async function tableNames(
  connection: GenerationConnection,
  schema: string,
): Promise<Set<string>> {
  const [rows] = await connection.query<TableNameRow[]>(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schema],
  );
  return new Set(rows.map((row) => row.name));
}

export async function activeState(
  connection: GenerationConnection,
  schema: string,
): Promise<GenerationState | null> {
  const tables = await tableNames(connection, schema);
  if (!tables.has("ranking_generation_state")) return null;
  const [rows] = await connection.query<GenerationStateRow[]>(
    `SELECT
       generation_id,
       export_id,
       artifact_format_version,
       dataset_schema_version,
       fingerprints_json,
       capabilities_json,
       source_sha,
       artifact_run_id,
       artifact_id,
       activation_tables_json,
       previous_tables_json
     FROM ${qualified(schema, "ranking_generation_state")}
     WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const fingerprints = parseJsonObject(row.fingerprints_json);
  return {
    generationId: row.generation_id,
    exportId: row.export_id,
    artifactFormatVersion: Number(row.artifact_format_version),
    datasetSchemaVersion: Number(row.dataset_schema_version),
    semanticFingerprints: stringMap(fingerprints.semantic),
    artifactFingerprints: stringMap(fingerprints.artifacts),
    artifactDigests: nullableStringMap(fingerprints.digests),
    capabilities: booleanMap(JSON.parse(row.capabilities_json || "{}")),
    sourceSha: row.source_sha,
    artifactRunId: Number(row.artifact_run_id),
    artifactId: Number(row.artifact_id),
    activationTables: stringArray(row.activation_tables_json),
    previousTables: stringArray(row.previous_tables_json),
  };
}

export async function acquireGenerationLock(
  connection: GenerationConnection,
): Promise<void> {
  const [rows] = await connection.query<LockRow[]>(
    "SELECT GET_LOCK(?, 0) AS acquired",
    [LOCK_NAME],
  );
  if (Number(rows[0]?.acquired) !== 1) {
    throw new Error(
      "The MariaDB ranking-generation activation lock is already held",
    );
  }
}

export async function releaseGenerationLock(
  connection: GenerationConnection,
): Promise<void> {
  await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
}
