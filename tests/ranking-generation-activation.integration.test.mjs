import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { test } from "bun:test";
import {
  activateGeneration,
  bootstrapGenerationState,
  rollbackGeneration,
} from "../data-tools/projections/deployment/generation/activate.ts";
import { activationTables } from "../data-tools/projections/deployment/generation/catalog.ts";

const applicationUrl = process.env.DATABASE_URL;
const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;

if (!applicationUrl && !adminUrl) {
  console.log(
    "Skipping ranking-generation MariaDB integration test: integration URLs are not configured.",
  );
} else {
  if (!applicationUrl || !adminUrl)
    throw new Error(
      "DATABASE_URL and INTEGRATION_ADMIN_DATABASE_URL must be configured together.",
    );

  function connectionOptions(connectionString, database) {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
    };
  }

  function identifier(value) {
    assert.match(value, /^[a-z][a-z0-9_]+$/);
    return `\`${value}\``;
  }

  const suffix = `${Date.now()}_${process.pid}`;
  const schemas = {
    production: `wcarankings_it_${suffix}`,
    candidate: `wcarankings_it_candidate_${suffix}`,
  };
  schemas.previous = `${schemas.candidate}_previous`;
  const release = (name, value) => ({
    semanticFingerprint: `${name}-semantic-${value}`,
    artifactFingerprint: `${name}-artifact-${value}`,
    artifactDigest: `sha256:${name}-${value}`,
  });
  const fullManifest = {
    version: 3,
    exportId: "2026-07-30T00:00:23Z",
    sourceSha: "a".repeat(40),
    compatibility: { artifactFormatVersion: 3, datasetSchemaVersion: 1 },
    raw: { file: "wca-export.sql.zip" },
    groups: {
      "ranking-tables": release("ranking-tables", "new"),
      "result-facts": release("result-facts", "new"),
      "result-rankings": release("result-rankings", "new"),
      "person-event-rankings": release("person-event-rankings", "new"),
      "competition-rankings": release("competition-rankings", "new"),
      "person-competition-rankings": release(
        "person-competition-rankings",
        "new",
      ),
      "person-activity-rankings": release("person-activity-rankings", "new"),
      "person-medal-rankings": release("person-medal-rankings", "new"),
      "person-pr-streak-rankings": release(
        "person-pr-streak-rankings",
        "new",
      ),
      "city-rankings": release("city-rankings", "new"),
      "sum-of-ranks": release("sum-of-ranks", "new"),
      "yearly-person-rankings": release("yearly-person-rankings", "new"),
    },
  };
  const oldExportId = "2026-07-29T00:00:23Z";

  async function execute(connection, sql, values = []) {
    await connection.query(sql, values);
  }

  async function createSchema(admin, schema) {
    await execute(admin, `CREATE DATABASE ${identifier(schema)}`);
    const appUser = new URL(applicationUrl).username;
    await execute(
      admin,
      `GRANT ALL PRIVILEGES ON ${identifier(schema)}.* TO ${identifier(decodeURIComponent(appUser))}@'%'`,
    );
  }

  async function initializeSchema(
    schema,
    tables,
    marker,
    exportId = oldExportId,
  ) {
    const connection = await mysql.createConnection(
      connectionOptions(adminUrl, schema),
    );
    try {
      const exportMetadata = await readFile(
        new URL(
          "../migrations/mysql/app/V1__export_metadata.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const generationState = await readFile(
        new URL(
          "../migrations/mysql/app/V9__ranking_generation_state.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await execute(connection, exportMetadata);
      await execute(connection, generationState);
      for (const table of tables.filter(
        (name) =>
          name !== "export_metadata" && name !== "ranking_generation_state",
      )) {
        await execute(
          connection,
          `CREATE TABLE ${identifier(table)} (marker VARCHAR(64) NOT NULL)`,
        );
        if (marker !== null) {
          await execute(
            connection,
            `INSERT INTO ${identifier(table)} (marker) VALUES (?)`,
            [marker],
          );
        }
      }
      if (marker !== null) {
        await execute(
          connection,
          "INSERT INTO export_metadata (`key`, `value`) VALUES ('export_date', ?), ('fetched_at', ?)",
          [exportId, "2026-07-29T01:00:00Z"],
        );
      }
      await execute(
        connection,
        "ALTER TABLE ranking_generation_state ADD COLUMN capabilities_json LONGTEXT NOT NULL DEFAULT '{}'",
      );
    } finally {
      await connection.end();
    }
  }

  async function insertState(schema, state) {
    const connection = await mysql.createConnection(
      connectionOptions(adminUrl, schema),
    );
    try {
      await execute(
        connection,
        `INSERT INTO ranking_generation_state
        (id, generation_id, export_id, artifact_format_version, dataset_schema_version,
         fingerprints_json, capabilities_json, source_sha, artifact_run_id, artifact_id,
         activation_tables_json, previous_tables_json, activated_at)
        VALUES (1, ?, ?, 3, 1, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
        [
          state.generationId,
          state.exportId,
          JSON.stringify({
            semantic: state.semanticFingerprints,
            artifacts: state.artifactFingerprints,
            digests: state.artifactDigests,
          }),
          JSON.stringify(state.capabilities),
          "b".repeat(40),
          9,
          state.artifactId,
          JSON.stringify(state.activationTables),
          JSON.stringify(state.activationTables),
        ],
      );
    } finally {
      await connection.end();
    }
  }

  async function marker(connection, schema, table) {
    const [rows] = await connection.query(
      `SELECT marker FROM ${identifier(schema)}.${identifier(table)}`,
    );
    return rows[0]?.marker;
  }

  async function state(connection, schema) {
    const [rows] = await connection.query(
      `SELECT generation_id, export_id, fingerprints_json FROM ${identifier(schema)}.ranking_generation_state WHERE id = 1`,
    );
    return rows[0];
  }

  test("activates and rolls back a real candidate schema, including a partial group", async () => {
    const admin = await mysql.createConnection(
      connectionOptions(adminUrl, "mysql"),
    );
    try {
      for (const schema of Object.values(schemas))
        await createSchema(admin, schema);
    } finally {
      await admin.end();
    }

    const fullTables = activationTables(fullManifest);
    await initializeSchema(schemas.production, fullTables, "old");
    await initializeSchema(
      schemas.candidate,
      fullTables,
      "new",
      fullManifest.exportId,
    );

    const bootstrapConnection = await mysql.createConnection(
      connectionOptions(applicationUrl, schemas.production),
    );
    try {
      const first = await bootstrapGenerationState({
        connection: bootstrapConnection,
        productionSchema: schemas.production,
      });
      const second = await bootstrapGenerationState({
        connection: bootstrapConnection,
        productionSchema: schemas.production,
      });
      assert.equal(first.bootstrapped, true);
      assert.equal(second.bootstrapped, false);
      assert.equal(first.state.exportId, new Date(oldExportId).toISOString());
      assert.deepEqual(first.state.capabilities, {
        core: true,
        resultRankings: true,
        competitionRankings: true,
        personActivityRankings: true,
        personCompetitionRankings: true,
        personEventRankings: true,
        personMedalRankings: true,
        personPrStreakRankings: true,
        cityEventStats: true,
        sumOfRanks: true,
        yearlyPersonRankings: true,
      });
      assert.deepEqual(first.state.artifactFingerprints, {});
      assert.deepEqual(first.state.activationTables, []);
      assert.deepEqual(first.state.previousTables, []);
      const [bootstrapRows] = await bootstrapConnection.query(
        "SELECT fingerprints_json FROM ranking_generation_state WHERE id = 1",
      );
      assert.deepEqual(JSON.parse(bootstrapRows[0].fingerprints_json), {
        semantic: {},
        artifacts: {},
        digests: {},
      });
      await execute(
        bootstrapConnection,
        "DELETE FROM ranking_generation_state WHERE id = 1",
      );
    } finally {
      await bootstrapConnection.end();
    }
    await insertState(schemas.production, {
      generationId: "old-generation",
      exportId: oldExportId,
      semanticFingerprints: Object.fromEntries(
        Object.keys(fullManifest.groups).map((name) => [
          name,
          `${name}-semantic-old`,
        ]),
      ),
      artifactFingerprints: Object.fromEntries(
        Object.keys(fullManifest.groups).map((name) => [
          name,
          `${name}-artifact-old`,
        ]),
      ),
      artifactDigests: Object.fromEntries(
        Object.keys(fullManifest.groups).map((name) => [
          name,
          `sha256:${name}-old`,
        ]),
      ),
      capabilities: {
        core: true,
        resultRankings: true,
        competitionRankings: true,
        personActivityRankings: true,
        personCompetitionRankings: true,
        personPrStreakRankings: true,
        cityEventStats: true,
        sumOfRanks: true,
        yearlyPersonRankings: true,
      },
      artifactId: 9,
      activationTables: fullTables,
    });

    const connection = await mysql.createConnection(
      connectionOptions(applicationUrl, schemas.production),
    );
    try {
      await activateGeneration({
        connection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        previousSchema: schemas.previous,
        manifest: fullManifest,
        artifactRunId: 20,
        artifactId: 30,
      });
      assert.equal(
        await marker(connection, schemas.production, "persons"),
        "new",
      );
      assert.equal(
        await marker(connection, schemas.previous, "persons"),
        "old",
      );
      assert.equal(
        (await state(connection, schemas.production)).export_id,
        fullManifest.exportId,
      );

      const rolledBack = await rollbackGeneration({
        connection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        artifactId: 30,
      });
      assert.equal(rolledBack.rolledBack, true);
      assert.equal(
        await marker(connection, schemas.production, "persons"),
        "old",
      );
      assert.equal(
        await marker(connection, schemas.candidate, "persons"),
        "new",
      );
      assert.equal(
        (await state(connection, schemas.production)).export_id,
        oldExportId,
      );
    } finally {
      await connection.end();
    }

    const partialManifest = {
      ...fullManifest,
      exportId: oldExportId,
      raw: null,
      groups: { "ranking-tables": release("ranking-tables", "partial") },
    };
    const partialTables = activationTables(partialManifest);
    const adminForPartial = await mysql.createConnection(
      connectionOptions(adminUrl, "mysql"),
    );
    try {
      for (const schema of [schemas.candidate, schemas.previous]) {
        await execute(adminForPartial, `DROP DATABASE ${identifier(schema)}`);
        await createSchema(adminForPartial, schema);
      }
    } finally {
      await adminForPartial.end();
    }
    await initializeSchema(schemas.candidate, partialTables, "partial");

    const partialConnection = await mysql.createConnection(
      connectionOptions(applicationUrl, schemas.production),
    );
    try {
      await activateGeneration({
        connection: partialConnection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        previousSchema: schemas.previous,
        manifest: partialManifest,
        artifactRunId: 21,
        artifactId: 31,
      });
      assert.equal(
        await marker(
          partialConnection,
          schemas.production,
          "ranking_entries_single",
        ),
        "partial",
      );
      assert.equal(
        await marker(
          partialConnection,
          schemas.production,
          "person_year_rankings_single",
        ),
        "old",
      );
      const partialState = await state(partialConnection, schemas.production);
      const partialFingerprints = JSON.parse(partialState.fingerprints_json);
      assert.equal(
        partialFingerprints.artifacts["ranking-tables"],
        "ranking-tables-artifact-partial",
      );
      assert.equal(
        partialFingerprints.artifacts["sum-of-ranks"],
        "sum-of-ranks-artifact-old",
      );
      const rolledBack = await rollbackGeneration({
        connection: partialConnection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        artifactId: 31,
      });
      assert.equal(rolledBack.rolledBack, true);
      assert.equal(
        await marker(
          partialConnection,
          schemas.production,
          "ranking_entries_single",
        ),
        "old",
      );
      assert.equal(
        await marker(
          partialConnection,
          schemas.production,
          "person_year_rankings_single",
        ),
        "old",
      );
    } finally {
      await partialConnection.end();
    }

    const cleanup = await mysql.createConnection(
      connectionOptions(adminUrl, "mysql"),
    );
    try {
      for (const schema of Object.values(schemas))
        await execute(cleanup, `DROP DATABASE IF EXISTS ${identifier(schema)}`);
    } finally {
      await cleanup.end();
    }
  });
}
