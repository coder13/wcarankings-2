import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function chunkDump(input, rowsPerInsert = 2) {
  return spawnSync(
    process.execPath,
    [
      "scripts/projections/transfer/chunk-projection-dump.ts",
      `--rows-per-insert=${rowsPerInsert}`,
    ],
    { cwd: new URL("..", import.meta.url), input, encoding: "utf8" },
  );
}

test("projection dump chunker bounds multi-row insert statements", () => {
  const input = [
    "-- preamble",
    "INSERT INTO `ranking_entries_single_transfer` VALUES",
    "(1,'one'),",
    "(2,'two'),",
    "(3,'three'),",
    "(4,'four'),",
    "(5,'five');",
    "UNLOCK TABLES;",
    "",
  ].join("\n");
  const result = chunkDump(input);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "-- preamble",
      "SET autocommit=0;",
      "INSERT INTO `ranking_entries_single_transfer` VALUES",
      "(1,'one'),",
      "(2,'two');",
      "INSERT INTO `ranking_entries_single_transfer` VALUES",
      "(3,'three'),",
      "(4,'four');",
      "INSERT INTO `ranking_entries_single_transfer` VALUES",
      "(5,'five');",
      "COMMIT;",
      "SET autocommit=1;",
      "UNLOCK TABLES;",
      "",
    ].join("\n"),
  );
});

test("projection dump chunker preserves ordinary SQL and rejects truncation", () => {
  const ordinary = chunkDump(
    "CREATE TABLE `example` (`id` INT);\nINSERT INTO `example` VALUES (1);\n",
  );
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(
    ordinary.stdout,
    "CREATE TABLE `example` (`id` INT);\nINSERT INTO `example` VALUES (1);\n",
  );

  const truncated = chunkDump("INSERT INTO `example` VALUES\n(1),\n");
  assert.notEqual(truncated.status, 0);
  assert.match(truncated.stderr, /Truncated projection dump/);
});

test("projection dump importer streams bounded SQL and propagates MariaDB failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wcarankings-chunk-import-"));
  const mariadb = join(directory, "mariadb");
  const capture = join(directory, "capture.sql");
  const argumentsFile = join(directory, "arguments");
  await writeFile(
    mariadb,
    `#!/bin/sh
printf '%s\n' "$@" > "$ARGUMENTS_FILE"
cat > "$CAPTURE_FILE"
exit "${"$"}{MARIADB_EXIT_CODE:-0}"
`,
  );
  await chmod(mariadb, 0o755);
  const input = "INSERT INTO `example_transfer` VALUES\n(1),\n(2),\n(3);\n";
  const environment = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    DATABASE_URL: "mysql://projection:secret@db:3306/wcarankings",
    DATABASE_NAME_OVERRIDE: "candidate",
    CAPTURE_FILE: capture,
    ARGUMENTS_FILE: argumentsFile,
  };

  try {
    const imported = spawnSync(
      process.execPath,
      [
        "scripts/projections/transfer/chunk-projection-dump.ts",
        "--import",
        "--rows-per-insert=2",
      ],
      {
        cwd: new URL("..", import.meta.url),
        input,
        encoding: "utf8",
        env: environment,
      },
    );
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(
      await readFile(capture, "utf8"),
      [
        "SET autocommit=0;",
        "INSERT INTO `example_transfer` VALUES",
        "(1),",
        "(2);",
        "INSERT INTO `example_transfer` VALUES",
        "(3);",
        "COMMIT;",
        "SET autocommit=1;",
        "",
      ].join("\n"),
    );
    assert.equal(
      await readFile(argumentsFile, "utf8"),
      [
        "--protocol=TCP",
        "--host=db",
        "--port=3306",
        "--user=projection",
        "candidate",
        "",
      ].join("\n"),
    );
    assert.doesNotMatch(await readFile(argumentsFile, "utf8"), /secret/);

    const failed = spawnSync(
      process.execPath,
      ["scripts/projections/transfer/chunk-projection-dump.ts", "--import"],
      {
        cwd: new URL("..", import.meta.url),
        input,
        encoding: "utf8",
        env: { ...environment, MARIADB_EXIT_CODE: "7" },
      },
    );
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /mariadb import failed with exit code 7/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
