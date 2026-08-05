import assert from "node:assert/strict";
import test from "node:test";
import {
  projectionTableUsage,
  unusedProjectionTables,
} from "../scripts/lib/projection-table-usage.ts";

const TABLES = [
  "runtime_sql_table",
  "runtime_table",
  "source_table",
  "unused_table",
];

const SOURCES = [
  {
    path: "services/rankings/query.ts",
    kind: "runtime-reference",
    content: 'const source = "runtime_table";',
  },
  {
    path: "lib/person-profile.ts",
    kind: "runtime-sql",
    content: 'const query = "SELECT * FROM runtime_sql_table";',
  },
  {
    path: "data-tools/projection-catalog/example/output.sql",
    kind: "projection-sql",
    content: "CREATE TABLE output_table AS SELECT * FROM `source_table`;",
  },
  {
    path: "data-tools/projection-catalog/example/unused.sql",
    kind: "projection-sql",
    content:
      "CREATE TABLE unused_table AS SELECT 1; ALTER TABLE unused_table ADD PRIMARY KEY (id);",
  },
  {
    path: "lib/admin-health.ts",
    kind: "runtime-sql",
    content: 'const requiredTables = ["unused_table"];',
  },
];

test("finds runtime and downstream SQL consumers", () => {
  assert.deepEqual(projectionTableUsage(TABLES, SOURCES), [
    {
      table: "runtime_sql_table",
      consumers: ["lib/person-profile.ts"],
    },
    {
      table: "runtime_table",
      consumers: ["services/rankings/query.ts"],
    },
    {
      table: "source_table",
      consumers: ["data-tools/projection-catalog/example/output.sql"],
    },
    { table: "unused_table", consumers: [] },
  ]);
});

test("does not count table creation or alteration as usage", () => {
  assert.deepEqual(unusedProjectionTables(TABLES, SOURCES), ["unused_table"]);
});
