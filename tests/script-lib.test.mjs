import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  argumentList,
  argumentPresent,
  argumentValue,
} from "../scripts/lib/arguments.ts";
import { runPool } from "../scripts/lib/async.ts";
import { databaseOptions } from "../scripts/lib/database.ts";

test("script argument helpers read scalar and comma-separated values", () => {
  const values = ["bun", "script.ts", "--groups=city,result", "--empty="];
  assert.equal(argumentValue("groups", values), "city,result");
  assert.deepEqual(argumentList("groups", values), ["city", "result"]);
  assert.equal(argumentValue("missing", values), "");
  assert.equal(argumentPresent("force", [...values, "--force"]), true);
});

test("database options decode a connection string and optional database name", () => {
  const connection = "mysql://user%40name:pass%20word@db.example:3307/rankings";
  assert.deepEqual(databaseOptions(connection), {
    host: "db.example",
    port: 3307,
    user: "user@name",
    password: "pass word",
    database: "rankings",
  });
  assert.equal(
    databaseOptions(connection, { databaseName: "candidate" }).database,
    "candidate",
  );
});

test("runPool limits concurrent tasks", async () => {
  let active = 0;
  let maximum = 0;
  await runPool([1, 2, 3, 4], 2, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
  });
  assert.equal(maximum, 2);
});
