import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  activateGeneration,
  bootstrapGenerationState,
  rollbackGeneration,
} from "../data-tools/projections/deployment/generation/activate.ts";
import {
  activationTables,
  capabilitiesFromTables,
} from "../data-tools/projections/deployment/generation/catalog.ts";
import {
  matchesActiveGeneration,
  mergedGenerationState,
} from "../data-tools/projections/deployment/generation/state.ts";

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
    "ranking-tables": {
      semanticFingerprint: "compat-semantic",
      artifactFingerprint: "compat-new",
      artifactDigest: "sha256:compat",
    },
    "result-facts": {
      semanticFingerprint: "facts-semantic",
      artifactFingerprint: "facts-new",
      artifactDigest: "sha256:facts",
    },
    "person-shared-grains": {
      semanticFingerprint: "shared-semantic",
      artifactFingerprint: "shared-new",
      artifactDigest: "sha256:shared",
    },
    "result-rankings": {
      semanticFingerprint: "result-semantic",
      artifactFingerprint: "result-new",
      artifactDigest: "sha256:result",
    },
    "person-event-rankings": {
      semanticFingerprint: "person-event-semantic",
      artifactFingerprint: "person-event-new",
      artifactDigest: "sha256:person-event",
    },
    "competition-rankings": {
      semanticFingerprint: "competition-semantic",
      artifactFingerprint: "competition-new",
      artifactDigest: "sha256:competition",
    },
    "person-competition-rankings": {
      semanticFingerprint: "person-competition-semantic",
      artifactFingerprint: "person-competition-new",
      artifactDigest: "sha256:person-competition",
    },
    "person-activity-rankings": {
      semanticFingerprint: "person-activity-semantic",
      artifactFingerprint: "person-activity-new",
      artifactDigest: "sha256:person-activity",
    },
    "person-medal-rankings": {
      semanticFingerprint: "person-medal-semantic",
      artifactFingerprint: "person-medal-new",
      artifactDigest: "sha256:person-medal",
    },
    "person-pr-streak-rankings": {
      semanticFingerprint: "person-pr-streak-semantic",
      artifactFingerprint: "person-pr-streak-new",
      artifactDigest: "sha256:person-pr-streak",
    },
    "city-rankings": {
      semanticFingerprint: "city-semantic",
      artifactFingerprint: "city-new",
      artifactDigest: "sha256:city",
    },
    "sum-of-ranks": {
      semanticFingerprint: "sum-semantic",
      artifactFingerprint: "sum-new",
      artifactDigest: "sha256:sum",
    },
    "yearly-person-rankings": {
      semanticFingerprint: "yearly-semantic",
      artifactFingerprint: "yearly-new",
      artifactDigest: "sha256:yearly",
    },
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
      semantic: {
        "ranking-tables": "core-rankings-semantic-old",
        untouched: "same-semantic",
      },
      artifacts: { "ranking-tables": "core-rankings-old", untouched: "same" },
      digests: { "ranking-tables": "sha256:old", untouched: "sha256:same" },
    }),
    capabilities_json: JSON.stringify({ core: true, sumOfRanks: true }),
    source_sha: "b".repeat(40),
    artifact_run_id: 9,
    artifact_id: artifactId,
    activation_tables_json: JSON.stringify(activation),
    previous_tables_json: JSON.stringify(previous),
  };
}

function fakeConnection({
  activeRow = stateRow(),
  schemas = {},
  exportRows = [
    { key: "export_date", value: manifest.exportId },
    { key: "fetched_at", value: "2026-07-30T00:01:00Z" },
  ],
  lockAcquired = true,
} = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, parameters = []) {
      statements.push({ sql, parameters });
      if (sql.includes("GET_LOCK"))
        return [[{ acquired: lockAcquired ? 1 : 0 }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("information_schema.tables")) {
        return [[...(schemas[parameters[0]] || [])].map((name) => ({ name }))];
      }
      if (sql.includes("FROM `wcarankings`.`ranking_generation_state`")) {
        return [[activeRow].filter(Boolean)];
      }
      if (sql.includes("FROM `wcarankings`.`export_metadata`")) {
        return [exportRows];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

test("bootstrap preserves an existing active generation without writing", async () => {
  const activeRow = stateRow();
  const connection = fakeConnection({
    activeRow,
    schemas: { wcarankings: ["ranking_generation_state"] },
  });
  const result = await bootstrapGenerationState({
    connection,
    productionSchema: "wcarankings",
  });

  assert.equal(result.bootstrapped, false);
  assert.equal(result.state.generationId, activeRow.generation_id);
  assert.equal(
    connection.statements.some(({ sql }) => sql.includes("INSERT INTO")),
    false,
  );
});

test("bootstrap fails closed without complete, valid export metadata", async () => {
  const tables = [
    "ranking_generation_state",
    "export_metadata",
    "ranking_entries_single",
    "ranking_entries_average",
  ];
  for (const exportRows of [
    [],
    [{ key: "export_date", value: manifest.exportId }],
    [
      { key: "export_date", value: "not-a-date" },
      { key: "fetched_at", value: "2026-07-30T00:01:00Z" },
    ],
    [
      { key: "export_date", value: manifest.exportId },
      { key: "fetched_at", value: "not-a-date" },
    ],
  ]) {
    const connection = fakeConnection({
      activeRow: null,
      schemas: { wcarankings: tables },
      exportRows,
    });
    await assert.rejects(
      bootstrapGenerationState({ connection, productionSchema: "wcarankings" }),
      /export_date|export identity|fetched_at/,
    );
    assert.equal(
      connection.statements.some(({ sql }) => sql.includes("INSERT INTO")),
      false,
    );
  }
});

test("bootstrap records only table-proven partial capabilities and no fabricated fingerprints", async () => {
  const tables = [
    "ranking_generation_state",
    "export_metadata",
    "ranking_entries_single",
    "ranking_entries_average",
    "competition_podium_members",
    "competition_event_stats",
    "competition_stats",
    "city_event_stats",
  ];
  const connection = fakeConnection({
    activeRow: null,
    schemas: { wcarankings: tables },
  });
  const result = await bootstrapGenerationState({
    connection,
    productionSchema: "wcarankings",
  });

  assert.equal(result.bootstrapped, true);
  assert.deepEqual(result.state.capabilities, {
    core: true,
    resultRankings: false,
    competitionRankings: true,
    personActivityRankings: false,
    personCompetitionRankings: false,
    personMedalRankings: false,
    personPrStreakRankings: false,
    personEventRankings: false,
    cityEventStats: true,
    sumOfRanks: false,
    yearlyPersonRankings: false,
  });
  assert.deepEqual(result.state.artifactFingerprints, {});
  assert.deepEqual(result.state.artifactDigests, {});
  assert.deepEqual(result.state.activationTables, []);
  assert.deepEqual(result.state.previousTables, []);
  const insert = connection.statements.find(({ sql }) =>
    sql.includes("INSERT INTO"),
  );
  assert.deepEqual(JSON.parse(insert.parameters[4]), {
    semantic: {},
    artifacts: {},
    digests: {},
  });
  assert.deepEqual(JSON.parse(insert.parameters[5]), result.state.capabilities);
});

test("bootstrap fails without the ranking-generation advisory lock", async () => {
  const connection = fakeConnection({ lockAcquired: false });
  await assert.rejects(
    bootstrapGenerationState({ connection, productionSchema: "wcarankings" }),
    /activation lock is already held/,
  );
  assert.equal(
    connection.statements.some(({ sql }) => sql.includes("INSERT INTO")),
    false,
  );
});

test("capability table mapping keeps city and competition ownership independent", () => {
  const capabilities = capabilitiesFromTables([
    "competition_podium_members",
    "competition_event_stats",
    "competition_stats",
    "city_event_stats",
  ]);
  assert.equal(capabilities.competitionRankings, true);
  assert.equal(capabilities.cityEventStats, true);
});

test("partial activation preserves unchanged artifacts and capabilities", () => {
  const next = mergedGenerationState({
    activeState: {
      semanticFingerprints: {
        "ranking-tables": "old-semantic",
        untouched: "same-semantic",
      },
      artifactFingerprints: { "ranking-tables": "old", untouched: "same" },
      artifactDigests: {
        "ranking-tables": "sha256:old",
        untouched: "sha256:same",
      },
      capabilities: { core: false, sumOfRanks: true },
    },
    manifest: {
      ...manifest,
      raw: null,
      groups: { "ranking-tables": manifest.groups["ranking-tables"] },
    },
    artifactRunId: 20,
    artifactId: 30,
  });
  assert.equal(next.artifactFingerprints["ranking-tables"], "compat-new");
  assert.equal(next.artifactFingerprints.untouched, "same");
  assert.equal(next.artifactDigests["ranking-tables"], "sha256:compat");
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
  assert.equal(
    matchesActiveGeneration({
      activeState,
      manifest,
      artifactRunId: 20,
      artifactId: 30,
    }),
    true,
  );
  assert.equal(
    matchesActiveGeneration({
      activeState,
      manifest,
      artifactRunId: 21,
      artifactId: 30,
    }),
    false,
  );
  assert.equal(
    matchesActiveGeneration({
      activeState,
      manifest: {
        ...manifest,
        groups: {
          ...manifest.groups,
          "ranking-tables": {
            ...manifest.groups["ranking-tables"],
            artifactFingerprint: "different",
          },
        },
      },
      artifactRunId: 20,
      artifactId: 30,
    }),
    false,
  );
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
  const rename = connection.statements.find(({ sql }) =>
    sql.startsWith("RENAME TABLE"),
  );
  assert.ok(rename);
  assert.match(
    rename.sql,
    /`wcarankings_candidate_30`\.`export_metadata` TO `wcarankings`\.`export_metadata`/,
  );
  assert.match(
    rename.sql,
    /`wcarankings_candidate_30`\.`ranking_generation_state` TO `wcarankings`\.`ranking_generation_state`/,
  );
  assert.match(
    rename.sql,
    /`wcarankings`\.`results` TO `wcarankings_candidate_30_previous`\.`results`/,
  );
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
  const insertIndex = connection.statements.findIndex(({ sql }) =>
    sql.includes("INSERT INTO"),
  );
  const renameIndex = connection.statements.findIndex(({ sql }) =>
    sql.startsWith("RENAME TABLE"),
  );
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
  const rename = connection.statements.find(({ sql }) =>
    sql.startsWith("RENAME TABLE"),
  );
  assert.match(
    rename.sql,
    /`wcarankings`\.`results` TO `wcarankings_candidate_30`\.`results`/,
  );
  assert.match(
    rename.sql,
    /`wcarankings_candidate_30_previous`\.`results` TO `wcarankings`\.`results`/,
  );
  assert.match(rename.sql, /ranking_generation_state/);
});
