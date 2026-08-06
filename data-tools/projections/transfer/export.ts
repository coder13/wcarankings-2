import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parseProjectionTransferMetadata } from "./metadata.ts";
import { runCommand } from "./process.ts";
import type {
  ExportProjectionTransferInput,
  ExportProjectionTransferResult,
} from "./types.ts";

export async function exportProjectionTransfer(
  input: ExportProjectionTransferInput,
): Promise<ExportProjectionTransferResult> {
  if (!input.outputPath.endsWith(".tar.gz")) {
    throw new Error("Projection transfer output must use .tar.gz");
  }
  const metadata = parseProjectionTransferMetadata(
    JSON.parse(await readFile(input.metadataPath, "utf8")),
  );
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
    await runCommand({
      command: "docker",
      args: [
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
      ],
    });
    await runCommand({
      command: "docker",
      args: ["compose", "cp", `db:${containerDirectory}/.`, copiedDirectory],
    });
    await runCommand({
      command: "sh",
      args: [
        "-ceu",
        'tar -C "$1" -cf - . | gzip -1 > "$2"',
        "sh",
        copiedDirectory,
        input.outputPath,
      ],
    });

    const files = metadata.tables.flatMap((table) => [
      `${table}.sql`,
      `${table}.txt`,
    ]);
    const updatedMetadata = {
      ...metadata,
      format: "mariadb-tab-v1",
      archiveFile: basename(input.outputPath),
      files,
    };
    await writeFile(
      input.metadataPath,
      `${JSON.stringify(updatedMetadata, null, 2)}\n`,
    );
    return {
      metadata: updatedMetadata,
      metadataPath: input.metadataPath,
      outputPath: input.outputPath,
    };
  } finally {
    await runCommand({
      command: "docker",
      args: [
        "compose",
        "exec",
        "-T",
        "db",
        "sh",
        "-ceu",
        'rm -rf "$1"',
        "sh",
        containerDirectory,
      ],
    }).catch(() => undefined);
    await rm(workDirectory, { recursive: true, force: true });
  }
}
