import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  PROJECTION_CAPABILITIES,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
} from "./projection-groups.mjs";
import { normalizeExportDate } from "./lib/projection-transfer-date.mjs";
import { argumentValue } from "./lib/cli.mjs";
import { databaseOptions } from "./lib/database.mjs";

export const WCA_RAW_TABLES = [
  "persons",
  "competitions",
  "events",
  "results",
  "result_attempts",
  "ranks_single",
  "ranks_average",
  "round_types",
  "formats",
  "countries",
  "continents",
  "scrambles",
  "championships",
  "eligible_country_iso2s_for_championship",
];

const LOCK_NAME = "wcarankings-ranking-generation";

function identifier(value, label) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value || "")) {
    throw new Error(`${label} is not a safe MariaDB identifier`);
  }
  return `\`${value}\``;
}

function qualified(schema, table) {
  return `${identifier(schema, "schema")}.${identifier(table, "table")}`;
}

function groupTables(groups) {
  const selected = new Set(groups);
  const definitions = DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) => selected.has(name));
  if (definitions.length !== selected.size) {
    throw new Error("The release contains an unknown projection group");
  }
  return [...new Set(definitions.flatMap(({ tables }) => tables))];
}

function groupRetiredTables(groups) {
  const selected = new Set(groups);
  return [...new Set(DEPLOYMENT_PROJECTION_GROUPS
    .filter(({ name }) => selected.has(name))
    .flatMap(({ retiredTables = [] }) => retiredTables))];
}

export function capabilitiesFromTables(tables) {
  const present = new Set(tables);
  const groups = new Map(
    DEPLOYMENT_PROJECTION_GROUPS.map((group) => [
      group.name,
      group.tables.every((table) => present.has(table)),
    ]),
  );
  return Object.fromEntries(
    Object.entries(PROJECTION_CAPABILITIES).map(([capability, requiredGroups]) => [
      capability,
      requiredGroups.every((group) => groups.get(group) === true),
    ]),
  );
}

export function activationTables(manifest) {
  const groups = Object.keys(manifest?.groups || {});
  if (groups.length === 0) throw new Error("The release contains no projection groups");
  if (
    manifest.raw
    && groups.length !== DEPLOYMENT_PROJECTION_GROUPS.length
  ) {
    throw new Error("A raw WCA export can only activate with every projection group");
  }
  return [
    ...(manifest.raw ? [...WCA_RAW_TABLES, "export_metadata"] : []),
    ...groupTables(groups),
    "ranking_generation_state",
  ];
}

export function mergedGenerationState({ activeState, manifest, artifactRunId, artifactId }) {
  if (manifest?.version !== 3) throw new Error("A version 3 generation manifest is required");
  const semanticFingerprints = { ...activeState?.semanticFingerprints };
  const artifactFingerprints = { ...activeState?.artifactFingerprints };
  const artifactDigests = { ...activeState?.artifactDigests };
  for (const [group, release] of Object.entries(manifest.groups || {})) {
    if (!release?.semanticFingerprint || !release?.artifactFingerprint) {
      throw new Error(`Missing fingerprints for ${group}`);
    }
    semanticFingerprints[group] = release.semanticFingerprint;
    artifactFingerprints[group] = release.artifactFingerprint;
    artifactDigests[group] = release.artifactDigest ?? null;
  }
  const capabilities = { ...activeState?.capabilities };
  for (const [capability, requiredGroups] of Object.entries(PROJECTION_CAPABILITIES)) {
    if (requiredGroups.some((group) => manifest.groups?.[group])) {
      capabilities[capability] = requiredGroups.every((group) => artifactFingerprints[group]);
    }
  }
  const generationId = `${manifest.exportId}:${artifactRunId}:${artifactId}`;
  if (
    !Number.isInteger(Number(manifest.compatibility?.artifactFormatVersion))
    || !Number.isInteger(Number(manifest.compatibility?.datasetSchemaVersion))
  ) {
    throw new Error("Generation compatibility metadata is invalid");
  }
  return {
    generationId,
    exportId: String(manifest.exportId),
    artifactFormatVersion: Number(manifest.compatibility?.artifactFormatVersion),
    datasetSchemaVersion: Number(manifest.compatibility?.datasetSchemaVersion),
    semanticFingerprints,
    artifactFingerprints,
    artifactDigests,
    capabilities,
    sourceSha: manifest.sourceSha,
    artifactRunId: Number(artifactRunId),
    artifactId: Number(artifactId),
  };
}

export function matchesActiveGeneration({ activeState: state, manifest, artifactRunId, artifactId }) {
  if (!state || !manifest) return false;
  if (
    String(state.exportId) !== String(manifest.exportId)
    || Number(state.artifactRunId) !== Number(artifactRunId)
    || Number(state.artifactId) !== Number(artifactId)
  ) {
    return false;
  }
  return Object.entries(manifest.groups || {}).every(
    ([group, release]) =>
      state.semanticFingerprints?.[group] === release.semanticFingerprint
      && state.artifactFingerprints?.[group] === release.artifactFingerprint,
  );
}

async function tableNames(connection, schema) {
  const [rows] = await connection.query(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schema],
  );
  return new Set(rows.map(({ name }) => name));
}

async function activeState(connection, schema) {
  const tables = await tableNames(connection, schema);
  if (!tables.has("ranking_generation_state")) return null;
  const [rows] = await connection.query(
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
  return {
    generationId: row.generation_id,
    exportId: row.export_id,
    artifactFormatVersion: Number(row.artifact_format_version),
    datasetSchemaVersion: Number(row.dataset_schema_version),
    semanticFingerprints: JSON.parse(row.fingerprints_json)?.semantic ?? {},
    artifactFingerprints: JSON.parse(row.fingerprints_json)?.artifacts ?? {},
    artifactDigests: JSON.parse(row.fingerprints_json)?.digests ?? {},
    capabilities: JSON.parse(row.capabilities_json || "{}"),
    sourceSha: row.source_sha,
    artifactRunId: Number(row.artifact_run_id),
    artifactId: Number(row.artifact_id),
    activationTables: JSON.parse(row.activation_tables_json),
    previousTables: JSON.parse(row.previous_tables_json),
  };
}

async function acquireLock(connection) {
  const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [LOCK_NAME]);
  if (Number(rows[0]?.acquired) !== 1) {
    throw new Error("The MariaDB ranking-generation activation lock is already held");
  }
}

async function releaseLock(connection) {
  await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]);
}

export async function bootstrapGenerationState({ connection, productionSchema }) {
  identifier(productionSchema, "production schema");
  await acquireLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    if (current) return { bootstrapped: false, state: current };

    const tables = await tableNames(connection, productionSchema);
    for (const required of ["ranking_generation_state", "export_metadata"]) {
      if (!tables.has(required)) {
        throw new Error(`Cannot bootstrap projection state without ${required}`);
      }
    }
    const [exportRows] = await connection.query(
      `SELECT \`key\`, value
         FROM ${qualified(productionSchema, "export_metadata")}
        WHERE \`key\` IN ('export_date', 'fetched_at')`,
    );
    const exportMetadata = new Map(exportRows.map((row) => [row.key, row.value]));
    if (exportRows.length !== 2 || exportMetadata.size !== 2) {
      throw new Error("Projection bootstrap requires one export_date and one fetched_at value");
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
    const state = {
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
    await connection.query(
      `INSERT INTO ${qualified(productionSchema, "ranking_generation_state")}
        (id, generation_id, export_id, artifact_format_version, dataset_schema_version,
         fingerprints_json, capabilities_json, source_sha, artifact_run_id, artifact_id,
         activation_tables_json, previous_tables_json, activated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        state.generationId,
        state.exportId,
        state.artifactFormatVersion,
        state.datasetSchemaVersion,
        JSON.stringify({ semantic: {}, artifacts: {}, digests: {} }),
        JSON.stringify(state.capabilities),
        state.sourceSha,
        state.artifactRunId,
        state.artifactId,
        JSON.stringify(state.activationTables),
        JSON.stringify(state.previousTables),
      ],
    );
    return { bootstrapped: true, state };
  } finally {
    await releaseLock(connection);
  }
}

function inject(point, requested = process.env.FAILURE_INJECTION_POINT) {
  if (requested === point) throw new Error(`Injected failure at ${point}`);
}

export async function activateGeneration({
  connection,
  productionSchema,
  candidateSchema,
  previousSchema,
  manifest,
  artifactRunId,
  artifactId,
  failurePoint,
}) {
  identifier(productionSchema, "production schema");
  identifier(candidateSchema, "candidate schema");
  identifier(previousSchema, "previous schema");
  await acquireLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    if (!manifest.raw) {
      const [exportRows] = await connection.query(
        `SELECT value
           FROM ${qualified(productionSchema, "export_metadata")}
          WHERE \`key\` = 'export_date'
          LIMIT 1`,
      );
      const productionExportId = exportRows[0]?.value;
      if (normalizeExportDate(productionExportId) !== normalizeExportDate(manifest.exportId)) {
        throw new Error(
          "A release without raw tables cannot change the active WCA export identity",
        );
      }
    }
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
    const retiredTables = groupRetiredTables(Object.keys(manifest.groups || {}))
      .filter((table) => !tables.includes(table));
    const [candidateTables, productionTables, previousTablesPresent] = await Promise.all([
      tableNames(connection, candidateSchema),
      tableNames(connection, productionSchema),
      tableNames(connection, previousSchema),
    ]);
    const missing = tables.filter((table) => !candidateTables.has(table));
    if (missing.length > 0) {
      throw new Error(`Candidate generation is missing tables: ${missing.join(", ")}`);
    }
    const occupied = [...tables, ...retiredTables]
      .filter((table) => previousTablesPresent.has(table));
    if (occupied.length > 0) {
      throw new Error(`Previous-generation schema is not empty: ${occupied.join(", ")}`);
    }
    const previousTables = [
      ...tables.filter((table) => productionTables.has(table)),
      ...retiredTables.filter((table) => productionTables.has(table)),
    ];

    await connection.query(
      `DELETE FROM ${qualified(candidateSchema, "ranking_generation_state")} WHERE id = 1`,
    );
    inject("before_production_state_update", failurePoint);
    await connection.query(
      `INSERT INTO ${qualified(candidateSchema, "ranking_generation_state")}
        (id, generation_id, export_id, artifact_format_version, dataset_schema_version,
         fingerprints_json, capabilities_json, source_sha, artifact_run_id, artifact_id,
         activation_tables_json, previous_tables_json, activated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        next.generationId,
        next.exportId,
        next.artifactFormatVersion,
        next.datasetSchemaVersion,
        JSON.stringify({
          semantic: next.semanticFingerprints,
          artifacts: next.artifactFingerprints,
          digests: next.artifactDigests,
        }),
        JSON.stringify(next.capabilities),
        next.sourceSha,
        next.artifactRunId,
        next.artifactId,
        JSON.stringify(tables),
        JSON.stringify(previousTables),
      ],
    );

    const renames = [];
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
    for (const table of retiredTables) {
      if (productionTables.has(table)) {
        renames.push(
          `${qualified(productionSchema, table)} TO ${qualified(previousSchema, table)}`,
        );
      }
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    inject("after_atomic_table_rename", failurePoint);
    return {
      alreadyActive: false,
      state: { ...next, activationTables: tables, previousTables },
    };
  } finally {
    await releaseLock(connection);
  }
}

export async function rollbackGeneration({
  connection,
  productionSchema,
  candidateSchema,
  artifactId,
}) {
  identifier(productionSchema, "production schema");
  identifier(candidateSchema, "candidate schema");
  await acquireLock(connection);
  try {
    const current = await activeState(connection, productionSchema);
    if (!current || Number(current.artifactId) !== Number(artifactId)) {
      return { rolledBack: false, reason: "requested generation is not active" };
    }
    const candidateTables = await tableNames(connection, candidateSchema);
    const occupied = current.activationTables.filter((table) => candidateTables.has(table));
    if (occupied.length > 0) {
      throw new Error(`Candidate schema cannot receive rollback tables: ${occupied.join(", ")}`);
    }
    const previous = new Set(current.previousTables);
    const retired = current.previousTables.filter((table) =>
      !current.activationTables.includes(table));
    const renames = [];
    for (const table of current.activationTables) {
      renames.push(
        `${qualified(productionSchema, table)} TO ${qualified(candidateSchema, table)}`,
      );
      if (previous.has(table)) {
        renames.push(
          `${qualified(`${candidateSchema}_previous`, table)} TO ${qualified(productionSchema, table)}`,
        );
      }
    }
    for (const table of retired) {
      renames.push(
        `${qualified(`${candidateSchema}_previous`, table)} TO ${qualified(productionSchema, table)}`,
      );
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    return { rolledBack: true };
  } finally {
    await releaseLock(connection);
  }
}

async function readManifest(path) {
  if (path !== "-") return JSON.parse(await readFile(path, "utf8"));
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const command = process.argv[2];
  const options = databaseOptions();
  const productionSchema = options.database;
  const candidateSchema = argumentValue("candidate-schema");
  const previousSchema = `${candidateSchema}_previous`;
  const connection = await mysql.createConnection(options);
  try {
    if (command === "activate") {
      const manifest = await readManifest(argumentValue("manifest") || "-");
      const result = await activateGeneration({
        connection,
        productionSchema,
        candidateSchema,
        previousSchema,
        manifest,
        artifactRunId: argumentValue("artifact-run-id"),
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (command === "verify-active") {
      const manifest = await readManifest(argumentValue("manifest") || "-");
      const state = await activeState(connection, productionSchema);
      const matches = matchesActiveGeneration({
        activeState: state,
        manifest,
        artifactRunId: argumentValue("artifact-run-id"),
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify({ matches, state })}\n`);
      if (!matches) process.exitCode = 2;
      return;
    }
    if (command === "rollback") {
      const result = await rollbackGeneration({
        connection,
        productionSchema,
        candidateSchema,
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (command === "state") {
      process.stdout.write(`${JSON.stringify(await activeState(connection, productionSchema) || {})}\n`);
      return;
    }
    if (command === "bootstrap") {
      process.stdout.write(`${JSON.stringify(await bootstrapGenerationState({
        connection,
        productionSchema,
      }))}\n`);
      return;
    }
    throw new Error("Use activate-ranking-generation.mjs activate, verify-active, rollback, state, or bootstrap");
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
