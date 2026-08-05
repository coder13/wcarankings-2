import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseProjectionTransferMetadata } from "./metadata.ts";
import type {
  DatabaseConnectionOptions,
  ImportProjectionTransferInput,
  ImportProjectionTransferResult,
} from "./types.ts";

interface RunMariaDbInput {
  input?: string;
  sql?: string;
}

function mariadbArguments(options: DatabaseConnectionOptions): string[] {
  return [
    "--protocol=TCP",
    `--host=${options.host}`,
    `--port=${options.port}`,
    `--user=${options.user}`,
    "--local-infile=1",
    options.database,
  ];
}

function runMariaDb(
  options: DatabaseConnectionOptions,
  input: RunMariaDbInput = {},
): Promise<void> {
  return new Promise<void>((resolveRun, reject) => {
    const args = mariadbArguments(options);
    if (input.sql) args.push(`--execute=${input.sql}`);
    const child = spawn("mariadb", args, {
      env: { ...process.env, MYSQL_PWD: options.password },
      stdio: [input.input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(
        new Error(
          `mariadb failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
    if (input.input) {
      if (!child.stdin) {
        reject(new Error("mariadb input stream is not available"));
        return;
      }
      child.stdin.end(input.input);
    }
  });
}

async function runPool(
  tables: readonly string[],
  concurrency: number,
  task: (table: string) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tables.length) {
      const index = cursor;
      cursor += 1;
      const table = tables[index];
      if (table) await task(table);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tables.length) }, worker),
  );
}

export async function importProjectionTransfer(
  input: ImportProjectionTransferInput,
): Promise<ImportProjectionTransferResult> {
  const metadata = parseProjectionTransferMetadata(
    JSON.parse(await readFile(input.metadataPath, "utf8")),
  );
  if (metadata.format !== "mariadb-tab-v1") {
    throw new Error(
      `Unsupported projection transfer format: ${metadata.format || "missing"}`,
    );
  }
  const schemas = await Promise.all(
    metadata.tables.map((table) =>
      readFile(resolve(input.directory, `${table}.sql`), "utf8"),
    ),
  );
  await runMariaDb(input.options, {
    input: `SET SESSION max_statement_time=0;\n${schemas.join("\n")}\n`,
  });

  const log = input.log ?? (() => undefined);
  let completed = 0;
  await runPool(metadata.tables, input.concurrency, async (table) => {
    const path = resolve(input.directory, `${table}.txt`)
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "''");
    const startedAt = performance.now();
    await runMariaDb(input.options, {
      sql: `SET SESSION max_statement_time=0; LOAD DATA LOCAL INFILE '${path}' INTO TABLE \`${table}\` CHARACTER SET utf8mb4 FIELDS TERMINATED BY '\\t' ESCAPED BY '\\\\' LINES TERMINATED BY '\\n'`,
    });
    completed += 1;
    log(
      `Loaded ${table} in ${Math.round(performance.now() - startedAt)}ms (${completed}/${metadata.tables.length})`,
    );
  });
  return { loadedTables: metadata.tables };
}
