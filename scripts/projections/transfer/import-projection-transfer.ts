import { argumentValue } from "../../lib/arguments.ts";
import { runPool } from "../../lib/async.ts";
import { databaseOptions } from "../../lib/database.ts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function mariadbArguments(options) {
  return [
    "--protocol=TCP",
    `--host=${options.host}`,
    `--port=${options.port}`,
    `--user=${options.user}`,
    "--local-infile=1",
    options.database,
  ];
}

function runMariaDb(options, { input, sql } = {}) {
  return new Promise((resolveRun, reject) => {
    const args = mariadbArguments(options);
    if (sql) args.push(`--execute=${sql}`);
    const child = spawn("mariadb", args, {
      env: { ...process.env, MYSQL_PWD: options.password },
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(
            `mariadb failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
          ),
        );
    });
    if (input) child.stdin.end(input);
  });
}

const directory = resolve(argumentValue("directory"));
const metadataPath = resolve(argumentValue("metadata"));
const concurrency = Number(
  argumentValue("concurrency") ||
    process.env.WCA_PROJECTION_IMPORT_CONCURRENCY ||
    2,
);
if (!directory || !metadataPath)
  throw new Error("--directory and --metadata are required");
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) {
  throw new Error("Projection import concurrency must be between 1 and 4");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (metadata.format !== "mariadb-tab-v1") {
  throw new Error(
    `Unsupported projection transfer format: ${metadata.format || "missing"}`,
  );
}
if (!Array.isArray(metadata.tables) || metadata.tables.length === 0) {
  throw new Error("Projection transfer metadata has no tables");
}
for (const table of metadata.tables) {
  if (!/^[a-z0-9_]+$/.test(table))
    throw new Error(`Unsafe transfer table: ${table}`);
}

const options = databaseOptions(undefined, {
  databaseName: process.env.DATABASE_NAME_OVERRIDE,
});
const schemas = await Promise.all(
  metadata.tables.map((table) =>
    readFile(resolve(directory, `${table}.sql`), "utf8"),
  ),
);
await runMariaDb(options, {
  input: `SET SESSION max_statement_time=0;\n${schemas.join("\n")}\n`,
});

let completed = 0;
await runPool(metadata.tables, concurrency, async (table) => {
  const path = resolve(directory, `${table}.txt`)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "''");
  const startedAt = performance.now();
  await runMariaDb(options, {
    sql: `SET SESSION max_statement_time=0; LOAD DATA LOCAL INFILE '${path}' INTO TABLE \`${table}\` CHARACTER SET utf8mb4 FIELDS TERMINATED BY '\\t' ESCAPED BY '\\\\' LINES TERMINATED BY '\\n'`,
  });
  completed += 1;
  process.stdout.write(
    `Loaded ${table} in ${Math.round(performance.now() - startedAt)}ms (${completed}/${metadata.tables.length}).\n`,
  );
});
