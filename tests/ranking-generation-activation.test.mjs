import assert from "node:assert/strict";
import test from "node:test";
import {
  activateGeneration,
  activationTables,
  matchesActiveGeneration,
  mergedGenerationState,
  rollbackGeneration,
} from "../scripts/activate-ranking-generation.mjs";

const manifest = {
  version: 3,
  exportId: "2026-07-30T00:00:23Z",
  sourceSha: "a".repeat(40),
  compatibility: {
    artifactFormatVersion: 3,
    datasetSchemaVersion: 1,
  },
  raw: { file: "wca-export.sql.zip" },
  groups: {
    compatibility: { semanticFingerprint: "compat-semantic", artifactFingerprint: "compat-new", artifactDigest: "sha256:compat" },
    "result-facts": { semanticFingerprint: "facts-semantic", artifactFingerprint: "facts-new", artifactDigest: "sha256:facts" },
    "result-rankings": { semanticFingerprint: "result-semantic", artifactFingerprint: "result-new", artifactDigest: "sha256:result" },
    "competition-rankings": { semanticFingerprint: "competition-semantic", artifactFingerprint: "competition-new", artifactDigest: "sha256:competition" },
    "city-rankings": { semanticFingerprint: "city-semantic", artifactFingerprint: "city-new", artifactDigest: "sha256:city" },
    "sum-of-ranks": { semanticFingerprint: "sum-semantic", artifactFingerprint: "sum-new", artifactDigest: "sha256:sum" },
    "yearly-person-rankings": { semanticFingerprint: "yearly-semantic", artifactFingerprint: "yearly-new", artifactDigest: "sha256:yearly" },
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
    artifact_format_version: 3,
    dataset_schema_version: 1,
    fingerprints_json: JSON.stringify({
      semantic: { compatibility: "compat-semantic-old", untouched: "same-semantic" },
      artifacts: { compatibility: "compat-old", untouched: "same" },
      digests: { compatibility: "sha256:old", untouched: "sha256:same" },
    }),
    capabilities_json: JSON.stringify({ core: true, sumOfRanks: true }),
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

test("partial activation preserves unchanged artifacts and capabilities", () => {
  const next = mergedGenerationState({
    activeState: {
      semanticFingerprints: { compatibility: "old-semantic", untouched: "same-semantic" },
      artifactFingerprints: { compatibility: "old", untouched: "same" },
      artifactDigests: { compatibility: "sha256:old", untouched: "sha256:same" },
      capabilities: { core: false, sumOfRanks: true },
    },
    manifest: {
      ...manifest,
      raw: null,
      groups: { compatibility: manifest.groups.compatibility },
    },
    artifactRunId: 20,
    artifactId: 30,
  });
  assert.equal(next.artifactFingerprints.compatibility, "compat-new");
  assert.equal(next.artifactFingerprints.untouched, "same");
  assert.equal(next.artifactDigests.compatibility, "sha256:compat");
  assert.equal(next.capabilities.core, true);
  assert.equal(next.capabilities.sumOfRanks, true);
  assert.equal(next.artifactFormatVersion, 3);
  assert.equal(next.datasetSchemaVersion, 1);
});

test("activated-phase recovery verifies the exact release identity and fingerprints", () => {
  const activeState = mergedGenerationState({
    activeState: null,
    manifest,
    artifactRunId: 20,
    artifactId: 30,
  });
  assert.equal(matchesActiveGeneration({ activeState, manifest, artifactRunId: 20, artifactId: 30 }), true);
  assert.equal(matchesActiveGeneration({ activeState, manifest, artifactRunId: 21, artifactId: 30 }), false);
  assert.equal(matchesActiveGeneration({
    activeState,
    manifest: {
      ...manifest,
      groups: {
        ...manifest.groups,
        compatibility: {
          ...manifest.groups.compatibility,
          artifactFingerprint: "different",
        },
      },
    },
    artifactRunId: 20,
    artifactId: 30,
  }), false);
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
