import { argumentValue } from "../../lib/arguments.ts";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(
            `${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
          ),
        );
    });
  });
}

const metadataPath = resolve(argumentValue("metadata"));
const outputPath = resolve(argumentValue("output"));
if (!metadataPath || !outputPath) {
  throw new Error("--metadata and --output are required");
}
if (!outputPath.endsWith(".tar.gz")) {
  throw new Error("Projection transfer output must use .tar.gz");
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
if (
  !metadata.group ||
  !Array.isArray(metadata.tables) ||
  metadata.tables.length === 0
) {
  throw new Error("Projection transfer metadata is invalid");
}
for (const table of metadata.tables) {
  if (!/^[a-z0-9_]+$/.test(table))
    throw new Error(`Unsafe transfer table: ${table}`);
}

const safeGroup = metadata.group.replaceAll("-", "_");
const containerDirectory = `/var/lib/mysql-files/projection-transfer-${safeGroup}`;
const workDirectory = await mkdtemp(
  join(tmpdir(), `projection-transfer-${safeGroup}-`),
);
const copiedDirectory = join(workDirectory, "files");

try {
  const exportScript = String.raw`
    set -eu
    destination=$1
    shift
    rm -rf "$destination"
    install -d -o mysql -g mysql "$destination"
    mariadb-dump \
      --user=root --password="$MARIADB_ROOT_PASSWORD" \
      --default-character-set=utf8mb4 \
      --skip-triggers --single-transaction --skip-lock-tables \
      --tab="$destination" \
      --fields-terminated-by='\t' \
      --fields-escaped-by='\\' \
      --lines-terminated-by='\n' \
      "$MARIADB_DATABASE" "$@"
  `;
  await run("docker", [
    "compose",
    "exec",
    "-T",
    "db",
    "sh",
    "-ceu",
    exportScript,
    "sh",
    containerDirectory,
    ...metadata.tables,
  ]);
  await run("docker", [
    "compose",
    "cp",
    `db:${containerDirectory}/.`,
    copiedDirectory,
  ]);
  await run("sh", [
    "-ceu",
    'tar -C "$1" -cf - . | gzip -1 > "$2"',
    "sh",
    copiedDirectory,
    outputPath,
  ]);

  const files = metadata.tables.flatMap((table) => [
    `${table}.sql`,
    `${table}.txt`,
  ]);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        ...metadata,
        format: "mariadb-tab-v1",
        archiveFile: basename(outputPath),
        files,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await run("docker", [
    "compose",
    "exec",
    "-T",
    "db",
    "sh",
    "-ceu",
    'rm -rf "$1"',
    "sh",
    containerDirectory,
  ]).catch(() => {});
  await rm(workDirectory, { recursive: true, force: true });
}
