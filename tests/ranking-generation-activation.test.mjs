import assert from "node:assert/strict";
import test from "node:test";
import {
  activateGeneration,
  activationTables,
  mergedGenerationState,
  rollbackGeneration,
} from "../scripts/activate-ranking-generation.mjs";

const manifest = {
  version: 2,
  exportId: "2026-07-30T00:00:23Z",
  sourceSha: "a".repeat(40),
  compatibility: {
    artifactFormatVersion: 2,
    datasetSchemaVersion: 1,
  },
  raw: { file: "wca-export.sql.zip" },
  groups: {
    core: { fingerprint: "core-new" },
    "sum-of-ranks": { fingerprint: "sum-new" },
    "yearly-person-rankings": { fingerprint: "yearly-new" },
  },
};

function stateRow({
  artifactId = 10,
  activation = activationTables(manifest),
  previous = activation,
} = {}) {
  return {
    generation_id: `old:${artifactId}`,
    export_id: "2026-07-29T00:00:23Z",
    artifact_format_version: 2,
    dataset_schema_version: 1,
    fingerprints_json: JSON.stringify({
      core: "core-old",
      "sum-of-ranks": "sum-old",
      "yearly-person-rankings": "yearly-old",
    }),
    source_sha: "b".repeat(40),
    artifact_run_id: 9,
    artifact_id: artifactId,
    activation_tables_json: JSON.stringify(activation),
    previous_tables_json: JSON.stringify(previous),
  };
}

function fakeConnection({ activeRow = stateRow(), schemas = {} } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("information_schema.tables")) {
        return [[...(schemas[parameters[0]] || [])].map((name) => ({ name }))];
      }
      if (sql.includes("FROM `wcarankings`.`ranking_generation_state`")) {
        return [[activeRow].filter(Boolean)];
      }
      if (sql.includes("FROM `wcarankings`.`export_metadata`")) {
        return [[{ value: manifest.exportId }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

test("exact fingerprints are state, while compatibility is versioned separately", () => {
  const next = mergedGenerationState({
    activeState: { fingerprints: { core: "old", untouched: "same" } },
    manifest: {
      ...manifest,
      raw: null,
      groups: { core: manifest.groups.core },
    },
    artifactRunId: 20,
    artifactId: 30,
  });
  assert.equal(next.fingerprints.core, "core-new");
  assert.equal(next.fingerprints.untouched, "same");
  assert.equal(next.artifactFormatVersion, 2);
  assert.equal(next.datasetSchemaVersion, 1);
});

test("activation renames raw data, projections, export metadata, and state atomically", async () => {
  const tables = activationTables(manifest);
  const connection = fakeConnection({
    schemas: {
      wcarankings: tables,
      wcarankings_candidate_30: tables,
      wcarankings_candidate_30_previous: [],
    },
  });
  await activateGeneration({
    connection,
    productionSchema: "wcarankings",
    candidateSchema: "wcarankings_candidate_30",
    previousSchema: "wcarankings_candidate_30_previous",
    manifest,
    artifactRunId: 20,
    artifactId: 30,
  });
  const rename = connection.statements.find(({ sql }) => sql.startsWith("RENAME TABLE"));
  assert.ok(rename);
  assert.match(rename.sql, /`wcarankings_candidate_30`\.`export_metadata` TO `wcarankings`\.`export_metadata`/);
  assert.match(rename.sql, /`wcarankings_candidate_30`\.`ranking_generation_state` TO `wcarankings`\.`ranking_generation_state`/);
  assert.match(rename.sql, /`wcarankings`\.`results` TO `wcarankings_candidate_30_previous`\.`results`/);
  assert.doesNotMatch(rename.sql, /DROP TABLE/);
});

test("failure before state staging cannot change active production tables", async () => {
  const tables = activationTables(manifest);
  const connection = fakeConnection({
    schemas: {
      wcarankings: tables,
      wcarankings_candidate_30: tables,
      wcarankings_candidate_30_previous: [],
    },
  });
  await assert.rejects(
    activateGeneration({
      connection,
      productionSchema: "wcarankings",
      candidateSchema: "wcarankings_candidate_30",
      previousSchema: "wcarankings_candidate_30_previous",
      manifest,
      artifactRunId: 20,
      artifactId: 30,
      failurePoint: "before_production_state_update",
    }),
    /Injected failure/,
  );
  assert.equal(
    connection.statements.some(({ sql }) => sql.startsWith("RENAME TABLE")),
    false,
  );
});

test("failure after atomic rename still has matching active database state", async () => {
  const tables = activationTables(manifest);
  const connection = fakeConnection({
    schemas: {
      wcarankings: tables,
      wcarankings_candidate_30: tables,
      wcarankings_candidate_30_previous: [],
    },
  });
  await assert.rejects(
    activateGeneration({
      connection,
      productionSchema: "wcarankings",
      candidateSchema: "wcarankings_candidate_30",
      previousSchema: "wcarankings_candidate_30_previous",
      manifest,
      artifactRunId: 20,
      artifactId: 30,
      failurePoint: "after_atomic_table_rename",
    }),
    /Injected failure/,
  );
  const insertIndex = connection.statements.findIndex(({ sql }) => sql.includes("INSERT INTO"));
  const renameIndex = connection.statements.findIndex(({ sql }) => sql.startsWith("RENAME TABLE"));
  assert.ok(insertIndex >= 0 && renameIndex > insertIndex);
});

test("rollback restores every prior table in one rename and keeps candidate work retryable", async () => {
  const tables = activationTables(manifest);
  const connection = fakeConnection({
    activeRow: stateRow({ artifactId: 30 }),
    schemas: {
      wcarankings: tables,
      wcarankings_candidate_30: [],
    },
  });
  const result = await rollbackGeneration({
    connection,
    productionSchema: "wcarankings",
    candidateSchema: "wcarankings_candidate_30",
    artifactId: 30,
  });
  assert.equal(result.rolledBack, true);
  const rename = connection.statements.find(({ sql }) => sql.startsWith("RENAME TABLE"));
  assert.match(rename.sql, /`wcarankings`\.`results` TO `wcarankings_candidate_30`\.`results`/);
  assert.match(rename.sql, /`wcarankings_candidate_30_previous`\.`results` TO `wcarankings`\.`results`/);
  assert.match(rename.sql, /ranking_generation_state/);
});
