import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import test from "node:test";
import {
  activateGeneration,
  activationTables,
  rollbackGeneration,
} from "../scripts/activate-ranking-generation.mjs";

const applicationUrl = process.env.DATABASE_URL;
const adminUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;

if (!applicationUrl && !adminUrl) {
  console.log("Skipping ranking-generation MariaDB integration test: integration URLs are not configured.");
} else {
  if (!applicationUrl || !adminUrl) throw new Error("DATABASE_URL and INTEGRATION_ADMIN_DATABASE_URL must be configured together.");

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
  const fullManifest = {
    version: 2,
    exportId: "2026-07-30T00:00:23Z",
    sourceSha: "a".repeat(40),
    compatibility: { artifactFormatVersion: 2, datasetSchemaVersion: 1 },
    raw: { file: "wca-export.sql.zip" },
    groups: {
      core: { fingerprint: "core-new" },
      "sum-of-ranks": { fingerprint: "sum-new" },
      "yearly-person-rankings": { fingerprint: "yearly-new" },
    },
  };
  const oldExportId = "2026-07-29T00:00:23Z";

  async function execute(connection, sql, values = []) {
    await connection.query(sql, values);
  }

  async function createSchema(admin, schema) {
    await execute(admin, `CREATE DATABASE ${identifier(schema)}`);
    const appUser = new URL(applicationUrl).username;
    await execute(admin, `GRANT ALL PRIVILEGES ON ${identifier(schema)}.* TO ${identifier(decodeURIComponent(appUser))}@'%'`);
  }

  async function initializeSchema(schema, tables, marker, exportId = oldExportId) {
    const connection = await mysql.createConnection(connectionOptions(adminUrl, schema));
    try {
      const exportMetadata = await readFile(new URL("../migrations/mysql/app/V1__export_metadata.sql", import.meta.url), "utf8");
      const generationState = await readFile(new URL("../migrations/mysql/app/V9__ranking_generation_state.sql", import.meta.url), "utf8");
      await execute(connection, exportMetadata);
      await execute(connection, generationState);
      for (const table of tables.filter((name) => name !== "export_metadata" && name !== "ranking_generation_state")) {
        await execute(connection, `CREATE TABLE ${identifier(table)} (marker VARCHAR(64) NOT NULL)`);
        if (marker !== null) {
          await execute(connection, `INSERT INTO ${identifier(table)} (marker) VALUES (?)`, [marker]);
        }
      }
      if (marker !== null) {
        await execute(connection, "INSERT INTO export_metadata (`key`, `value`) VALUES ('export_date', ?), ('fetched_at', ?)", [exportId, "2026-07-29T01:00:00Z"]);
      }
    } finally {
      await connection.end();
    }
  }

  async function insertState(schema, state) {
    const connection = await mysql.createConnection(connectionOptions(adminUrl, schema));
    try {
      await execute(connection, `INSERT INTO ranking_generation_state
        (id, generation_id, export_id, artifact_format_version, dataset_schema_version,
         fingerprints_json, source_sha, artifact_run_id, artifact_id,
         activation_tables_json, previous_tables_json, activated_at)
        VALUES (1, ?, ?, 2, 1, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`, [
        state.generationId,
        state.exportId,
        JSON.stringify(state.fingerprints),
        "b".repeat(40),
        9,
        state.artifactId,
        JSON.stringify(state.activationTables),
        JSON.stringify(state.activationTables),
      ]);
    } finally {
      await connection.end();
    }
  }

  async function marker(connection, schema, table) {
    const [rows] = await connection.query(`SELECT marker FROM ${identifier(schema)}.${identifier(table)}`);
    return rows[0]?.marker;
  }

  async function state(connection, schema) {
    const [rows] = await connection.query(`SELECT generation_id, export_id, fingerprints_json FROM ${identifier(schema)}.ranking_generation_state WHERE id = 1`);
    return rows[0];
  }

  test("activates and rolls back a real candidate schema, including a partial group", async () => {
    const admin = await mysql.createConnection(connectionOptions(adminUrl, "mysql"));
    try {
      for (const schema of Object.values(schemas)) await createSchema(admin, schema);
    } finally {
      await admin.end();
    }

    const fullTables = activationTables(fullManifest);
    await initializeSchema(schemas.production, fullTables, "old");
    await initializeSchema(schemas.candidate, fullTables, "new", fullManifest.exportId);
    await insertState(schemas.production, {
      generationId: "old-generation",
      exportId: oldExportId,
      fingerprints: { core: "core-old", "sum-of-ranks": "sum-old", "yearly-person-rankings": "yearly-old" },
      artifactId: 9,
      activationTables: fullTables,
    });

    const connection = await mysql.createConnection(connectionOptions(applicationUrl, schemas.production));
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
      assert.equal(await marker(connection, schemas.production, "persons"), "new");
      assert.equal(await marker(connection, schemas.previous, "persons"), "old");
      assert.equal((await state(connection, schemas.production)).export_id, fullManifest.exportId);

      const rolledBack = await rollbackGeneration({
        connection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        artifactId: 30,
      });
      assert.equal(rolledBack.rolledBack, true);
      assert.equal(await marker(connection, schemas.production, "persons"), "old");
      assert.equal(await marker(connection, schemas.candidate, "persons"), "new");
      assert.equal((await state(connection, schemas.production)).export_id, oldExportId);
    } finally {
      await connection.end();
    }

    const partialManifest = {
      ...fullManifest,
      exportId: oldExportId,
      raw: null,
      groups: { core: { fingerprint: "core-partial" } },
    };
    const partialTables = activationTables(partialManifest);
    const adminForPartial = await mysql.createConnection(connectionOptions(adminUrl, "mysql"));
    try {
      for (const schema of [schemas.candidate, schemas.previous]) {
        await execute(adminForPartial, `DROP DATABASE ${identifier(schema)}`);
        await createSchema(adminForPartial, schema);
      }
    } finally {
      await adminForPartial.end();
    }
    await initializeSchema(schemas.candidate, partialTables, "partial");

    const partialConnection = await mysql.createConnection(connectionOptions(applicationUrl, schemas.production));
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
      assert.equal(await marker(partialConnection, schemas.production, "ranking_entries_single"), "partial");
      assert.equal(await marker(partialConnection, schemas.production, "person_year_rankings_single"), "old");
      const partialState = await state(partialConnection, schemas.production);
      assert.deepEqual(JSON.parse(partialState.fingerprints_json), {
        core: "core-partial",
        "sum-of-ranks": "sum-old",
        "yearly-person-rankings": "yearly-old",
      });
      const rolledBack = await rollbackGeneration({
        connection: partialConnection,
        productionSchema: schemas.production,
        candidateSchema: schemas.candidate,
        artifactId: 31,
      });
      assert.equal(rolledBack.rolledBack, true);
      assert.equal(await marker(partialConnection, schemas.production, "ranking_entries_single"), "old");
      assert.equal(await marker(partialConnection, schemas.production, "person_year_rankings_single"), "old");
    } finally {
      await partialConnection.end();
    }

    const cleanup = await mysql.createConnection(connectionOptions(adminUrl, "mysql"));
    try {
      for (const schema of Object.values(schemas)) await execute(cleanup, `DROP DATABASE IF EXISTS ${identifier(schema)}`);
    } finally {
      await cleanup.end();
    }
  });
}
