import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/projection-build-matrix.mjs", import.meta.url));

function buildMatrix(groups, wave) {
  const result = spawnSync(process.execPath, [script, `--wave=${wave}`], {
    env: { ...process.env, BUILD_GROUPS: groups.join(",") },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function groupNames(matrix) {
  return matrix.include.map(({ group }) => group);
}

test("projection build waves follow selected dependency levels", () => {
  const groups = [
    "result-facts",
    "solve-facts",
    "result-rankings",
    "competition-rankings",
    "city-rankings",
  ];

  assert.deepEqual(groupNames(buildMatrix(groups, 1)), [
    "result-facts",
    "competition-rankings",
  ]);
  assert.deepEqual(groupNames(buildMatrix(groups, 2)), [
    "solve-facts",
    "city-rankings",
  ]);
  assert.deepEqual(groupNames(buildMatrix(groups, 3)), ["result-rankings"]);

  assert.equal(
    buildMatrix(groups, 3).include[0].hydrate_groups,
    "result-facts,solve-facts",
  );
});

test("V15 does not require optional ranking projections in a fresh database", async () => {
  const migration = await readFile(
    new URL("../migrations/mysql/app/V15__incremental_list_ranking_cache.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /information_schema\.tables/);
  assert.match(migration, /table_name = 'person_event_rankings'/);
  assert.match(migration, /PREPARE person_ranking_backfill FROM/);
});
