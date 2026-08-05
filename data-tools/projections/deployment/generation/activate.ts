import { PROJECTION_ARTIFACT_FORMAT_VERSION } from "../../../projection-catalog/registry.ts";
import { normalizeExportDate } from "../../../shared/date.ts";
import { activationTables, capabilitiesFromTables } from "./catalog.ts";
import {
  acquireGenerationLock,
  activeState,
  qualified,
  releaseGenerationLock,
  tableNames,
  validateSchemaName,
} from "./database.ts";
import { mergedGenerationState } from "./state.ts";
import type {
  ActivateGenerationInput,
  ActivateGenerationResult,
  BootstrapGenerationStateInput,
  BootstrapGenerationStateResult,
  ExportMetadataRow,
  ExportValueRow,
  GenerationConnection,
  GenerationState,
  RollbackGenerationInput,
  RollbackGenerationResult,
} from "./types.ts";

function injectFailure(point: string, requested?: string): void {
  const failurePoint = requested ?? process.env.FAILURE_INJECTION_POINT;
  if (failurePoint === point) {
    throw new Error(`Injected failure at ${point}`);
  }
}

async function writeGenerationState(
  connection: GenerationConnection,
  schema: string,
  state: GenerationState,
): Promise<void> {
  await connection.query(
    `INSERT INTO ${qualified(schema, "ranking_generation_state")}
      (id, generation_id, export_id, artifact_format_version, dataset_schema_version,
       fingerprints_json, capabilities_json, source_sha, artifact_run_id, artifact_id,
       activation_tables_json, previous_tables_json, activated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
    [
      state.generationId,
      state.exportId,
      state.artifactFormatVersion,
      state.datasetSchemaVersion,
      JSON.stringify({
        semantic: state.semanticFingerprints,
        artifacts: state.artifactFingerprints,
        digests: state.artifactDigests,
      }),
      JSON.stringify(state.capabilities),
      state.sourceSha,
      state.artifactRunId,
      state.artifactId,
      JSON.stringify(state.activationTables),
      JSON.stringify(state.previousTables),
    ],
  );
}

async function productionExportId(
  connection: GenerationConnection,
  productionSchema: string,
): Promise<string | undefined> {
  const [rows] = await connection.query<ExportValueRow[]>(
    `SELECT value
       FROM ${qualified(productionSchema, "export_metadata")}
      WHERE \`key\` = 'export_date'
      LIMIT 1`,
  );
  return rows[0]?.value;
}

async function validatePartialReleaseExport(
  input: ActivateGenerationInput,
): Promise<void> {
  if (input.manifest.raw) return;
  const exportId = await productionExportId(
    input.connection,
    input.productionSchema,
  );
  if (
    normalizeExportDate(exportId) !==
    normalizeExportDate(input.manifest.exportId)
  ) {
    throw new Error(
      "A release without raw tables cannot change the active WCA export identity",
    );
  }
}

export async function bootstrapGenerationState(
  input: BootstrapGenerationStateInput,
): Promise<BootstrapGenerationStateResult> {
  const { connection, productionSchema } = input;
  validateSchemaName(productionSchema, "production schema");
  await acquireGenerationLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    if (current) return { bootstrapped: false, state: current };

    const tables = await tableNames(connection, productionSchema);
    for (const required of ["ranking_generation_state", "export_metadata"]) {
      if (!tables.has(required)) {
        throw new Error(
          `Cannot bootstrap projection state without ${required}`,
        );
      }
    }
    const [exportRows] = await connection.query<ExportMetadataRow[]>(
      `SELECT \`key\`, value
         FROM ${qualified(productionSchema, "export_metadata")}
        WHERE \`key\` IN ('export_date', 'fetched_at')`,
    );
    const exportMetadata = new Map(
      exportRows.map((row) => [row.key, row.value]),
    );
    if (exportRows.length !== 2 || exportMetadata.size !== 2) {
      throw new Error(
        "Projection bootstrap requires one export_date and one fetched_at value",
      );
    }
    const exportId = normalizeExportDate(exportMetadata.get("export_date"));
    if (!exportId) {
      throw new Error("Projection bootstrap export identity is invalid");
    }
    const fetchedAt = normalizeExportDate(exportMetadata.get("fetched_at"));
    if (!fetchedAt) {
      throw new Error("Projection bootstrap fetched_at metadata is invalid");
    }

    const capabilities = capabilitiesFromTables(tables);
    if (!capabilities.core) {
      throw new Error("Projection bootstrap requires every core ranking table");
    }
    const state: GenerationState = {
      generationId: `bootstrap:${exportId}`,
      exportId,
      artifactFormatVersion: PROJECTION_ARTIFACT_FORMAT_VERSION,
      datasetSchemaVersion: 1,
      semanticFingerprints: {},
      artifactFingerprints: {},
      artifactDigests: {},
      capabilities,
      sourceSha: "0".repeat(40),
      artifactRunId: 0,
      artifactId: 0,
      activationTables: [],
      previousTables: [],
    };
    await writeGenerationState(connection, productionSchema, state);
    return { bootstrapped: true, state };
  } finally {
    await releaseGenerationLock(connection);
  }
}

export async function activateGeneration(
  input: ActivateGenerationInput,
): Promise<ActivateGenerationResult> {
  const {
    connection,
    productionSchema,
    candidateSchema,
    previousSchema,
    manifest,
    artifactRunId,
    artifactId,
    failurePoint,
  } = input;
  validateSchemaName(productionSchema, "production schema");
  validateSchemaName(candidateSchema, "candidate schema");
  validateSchemaName(previousSchema, "previous schema");
  await acquireGenerationLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    await validatePartialReleaseExport(input);
    const next = mergedGenerationState({
      activeState: current,
      manifest,
      artifactRunId,
      artifactId,
    });
    if (current?.generationId === next.generationId) {
      return { alreadyActive: true, state: current };
    }

    const tables = activationTables(manifest);
    const [candidateTables, productionTables, previousTablesPresent] =
      await Promise.all([
        tableNames(connection, candidateSchema),
        tableNames(connection, productionSchema),
        tableNames(connection, previousSchema),
      ]);
    const missing = tables.filter((table) => !candidateTables.has(table));
    if (missing.length > 0) {
      throw new Error(
        `Candidate generation is missing tables: ${missing.join(", ")}`,
      );
    }
    const occupied = tables.filter((table) => previousTablesPresent.has(table));
    if (occupied.length > 0) {
      throw new Error(
        `Previous-generation schema is not empty: ${occupied.join(", ")}`,
      );
    }
    const previousTables = tables.filter((table) =>
      productionTables.has(table),
    );
    const stagedState: GenerationState = {
      ...next,
      activationTables: tables,
      previousTables,
    };

    await connection.query(
      `DELETE FROM ${qualified(candidateSchema, "ranking_generation_state")} WHERE id = 1`,
    );
    injectFailure("before_production_state_update", failurePoint);
    await writeGenerationState(connection, candidateSchema, stagedState);

    const renames: string[] = [];
    for (const table of tables) {
      if (productionTables.has(table)) {
        renames.push(
          `${qualified(productionSchema, table)} TO ${qualified(previousSchema, table)}`,
        );
      }
      renames.push(
        `${qualified(candidateSchema, table)} TO ${qualified(productionSchema, table)}`,
      );
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    injectFailure("after_atomic_table_rename", failurePoint);
    return { alreadyActive: false, state: stagedState };
  } finally {
    await releaseGenerationLock(connection);
  }
}

export async function rollbackGeneration(
  input: RollbackGenerationInput,
): Promise<RollbackGenerationResult> {
  const { connection, productionSchema, candidateSchema, artifactId } = input;
  validateSchemaName(productionSchema, "production schema");
  validateSchemaName(candidateSchema, "candidate schema");
  await acquireGenerationLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    if (!current || current.artifactId !== Number(artifactId)) {
      return {
        rolledBack: false,
        reason: "requested generation is not active",
      };
    }
    const candidateTables = await tableNames(connection, candidateSchema);
    const occupied = current.activationTables.filter((table) =>
      candidateTables.has(table),
    );
    if (occupied.length > 0) {
      throw new Error(
        `Candidate schema cannot receive rollback tables: ${occupied.join(", ")}`,
      );
    }
    const previous = new Set(current.previousTables);
    const previousSchema = `${candidateSchema}_previous`;
    const renames: string[] = [];
    for (const table of current.activationTables) {
      renames.push(
        `${qualified(productionSchema, table)} TO ${qualified(candidateSchema, table)}`,
      );
      if (previous.has(table)) {
        renames.push(
          `${qualified(previousSchema, table)} TO ${qualified(productionSchema, table)}`,
        );
      }
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    return { rolledBack: true };
  } finally {
    await releaseGenerationLock(connection);
  }
}
